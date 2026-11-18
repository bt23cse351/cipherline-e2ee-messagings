import { useCallback, useEffect, useState } from 'react';
import {
  Lock,
  LogOut,
  MessageSquare,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { ChatWindow } from '../components/ChatWindow';
import { ConversationList } from '../components/ConversationList';
import { UserDirectory } from '../components/UserDirectory';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import type {
  ConversationSummary,
  EncryptedMessageEnvelope,
  PublicUser,
} from '../types/messaging';
import { ProfileView } from './ProfileView';
import { SecurityDetailsView } from './SecurityDetailsView';

type ActiveTab = 'chats' | 'people' | 'security' | 'profile';

export function Dashboard() {
  const { user, token, socket, socketConnected, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('chats');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [incomingBuffer, setIncomingBuffer] = useState<EncryptedMessageEnvelope[]>([]);
  const [securityContact, setSecurityContact] = useState<PublicUser | null>(null);

  const fetchConversations = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.listConversations(token);
      setConversations(res.conversations);
    } catch {
      // Keep current state on transient errors
    } finally {
      setLoadingConvs(false);
    }
  }, [token]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Real-time Socket.IO event listeners
  useEffect(() => {
    if (!socket) return;

    const handlePresence = (payload: {
      userId: string;
      isOnline: boolean;
      lastSeen: string;
    }) => {
      setConversations((prev) =>
        prev.map((conv) =>
          conv.peer?.id === payload.userId
            ? {
                ...conv,
                peer: {
                  ...conv.peer,
                  isOnline: payload.isOnline,
                  lastSeen: payload.lastSeen,
                },
              }
            : conv
        )
      );
    };

    const handleNewMessage = (envelope: EncryptedMessageEnvelope) => {
      setIncomingBuffer((prev) => {
        if (prev.some((m) => m.messageId === envelope.messageId)) {
          return prev;
        }
        return [...prev.slice(-150), envelope];
      });

      if (envelope.senderId !== user?.id) {
        socket.emit('message:delivered', { messageId: envelope.messageId });
      }

      setConversations((prev) => {
        const exists = prev.some((c) => c.id === envelope.conversationId);
        if (!exists) {
          fetchConversations();
          return prev;
        }
        return prev
          .map((c) => {
            if (c.id !== envelope.conversationId) return c;
            const isOpen = selectedConversationId === c.id && activeTab === 'chats';
            const incrementUnread =
              envelope.recipientId === user?.id && !isOpen ? 1 : 0;
            return {
              ...c,
              lastMessage: envelope,
              lastMessageAt: envelope.clientTimestamp,
              updatedAt: envelope.clientTimestamp,
              unreadCount: isOpen ? 0 : c.unreadCount + incrementUnread,
            };
          })
          .sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
      });
    };

    const handleDelivered = (payload: {
      messageId: string;
      conversationId: string;
      deliveredAt: string;
    }) => {
      setIncomingBuffer((prev) =>
        prev.map((m) =>
          m.messageId === payload.messageId
            ? { ...m, deliveredAt: payload.deliveredAt }
            : m
        )
      );
    };

    const handleRead = (payload: {
      messageId: string;
      conversationId: string;
      deliveredAt: string;
      readAt: string;
    }) => {
      setIncomingBuffer((prev) =>
        prev.map((m) =>
          m.messageId === payload.messageId
            ? { ...m, deliveredAt: payload.deliveredAt, readAt: payload.readAt }
            : m
        )
      );
    };

    const handleReconnect = () => {
      fetchConversations();
      if (selectedConversationId) {
        socket.emit('conversation:join', { conversationId: selectedConversationId });
      }
    };

    socket.on('user:online', handlePresence);
    socket.on('user:offline', handlePresence);
    socket.on('message:new', handleNewMessage);
    socket.on('message:delivered', handleDelivered);
    socket.on('message:read', handleRead);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('user:online', handlePresence);
      socket.off('user:offline', handlePresence);
      socket.off('message:new', handleNewMessage);
      socket.off('message:delivered', handleDelivered);
      socket.off('message:read', handleRead);
      socket.off('connect', handleReconnect);
    };
  }, [activeTab, fetchConversations, selectedConversationId, socket, user?.id]);

  const handleSelectConversation = (conv: ConversationSummary) => {
    setSelectedConversationId(conv.id);
    setActiveTab('chats');
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c))
    );
  };

  const handleStartConversation = async (peer: PublicUser) => {
    if (!token) return;
    const res = await api.createOrGetConversation(token, peer.id);
    const conv = res.conversation;
    setConversations((prev) => {
      const exists = prev.some((c) => c.id === conv.id);
      return exists ? prev : [conv, ...prev];
    });
    setSelectedConversationId(conv.id);
    setActiveTab('chats');
  };

  const handleInspectSecurity = (peer: PublicUser) => {
    setSecurityContact(peer);
    setActiveTab('security');
  };

  const handleMessageSentOrReceived = (msg: EncryptedMessageEnvelope) => {
    setConversations((prev) =>
      prev
        .map((c) =>
          c.id === msg.conversationId
            ? {
                ...c,
                lastMessage: msg,
                lastMessageAt: msg.clientTimestamp,
                updatedAt: msg.clientTimestamp,
              }
            : c
        )
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
    );
  };

  const selectedConversation =
    conversations.find((c) => c.id === selectedConversationId) || null;

  const navItems: Array<{ id: ActiveTab; label: string; icon: typeof MessageSquare }> = [
    { id: 'chats', label: 'Chats', icon: MessageSquare },
    { id: 'people', label: 'People', icon: Users },
    { id: 'security', label: 'Security', icon: ShieldCheck },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col md:flex-row bg-slate-100">
      {/* Desktop Left Navigation Rail */}
      <aside className="hidden md:flex w-18 bg-slate-900 text-slate-300 flex-col items-center justify-between py-4 border-r border-slate-800 shrink-0">
        <div className="flex flex-col items-center gap-6">
          <div
            className="h-10 w-10 rounded-xl bg-teal-700 text-white flex items-center justify-center"
            title="CipherLine E2EE"
          >
            <Lock className="h-5 w-5" />
          </div>

          <nav className="flex flex-col items-center gap-2" aria-label="Primary navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-12 py-2 rounded-xl flex flex-col items-center gap-1 transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-teal-400'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                  title={item.label}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col items-center gap-3">
          {user && (
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              title={`@${user.username}`}
            >
              <Avatar
                username={user.username}
                isOnline={socketConnected}
                showPresence
                size="sm"
              />
            </button>
          )}
          <button
            type="button"
            onClick={logout}
            className="p-2.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition-colors"
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="md:hidden bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-teal-400" />
          <span className="font-display text-sm font-semibold">CipherLine</span>
        </div>
        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id === 'chats') setSelectedConversationId(null);
                }}
                className={`p-2 rounded-lg text-xs flex items-center gap-1 ${
                  isActive ? 'bg-slate-800 text-teal-400' : 'text-slate-300'
                }`}
                aria-label={item.label}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
          <button
            type="button"
            onClick={logout}
            className="p-2 text-slate-300 hover:text-red-400"
            aria-label="Sign Out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex min-h-0 overflow-hidden">
        {activeTab === 'chats' && (
          <>
            <div
              className={`${
                selectedConversation ? 'hidden md:flex' : 'flex'
              } w-full md:w-80 lg:w-96 flex-col shrink-0 h-full`}
            >
              <ConversationList
                conversations={conversations}
                selectedConversationId={selectedConversationId}
                loading={loadingConvs}
                onSelectConversation={handleSelectConversation}
                onOpenDirectory={() => setActiveTab('people')}
              />
            </div>

            <div
              className={`${
                selectedConversation ? 'flex' : 'hidden md:flex'
              } flex-1 flex-col h-full min-w-0`}
            >
              {selectedConversation ? (
                <ChatWindow
                  conversation={selectedConversation}
                  incomingMessages={incomingBuffer}
                  onBackMobile={() => setSelectedConversationId(null)}
                  onInspectPeerSecurity={handleInspectSecurity}
                  onMessageSentOrReceived={handleMessageSentOrReceived}
                />
              ) : (
                <div className="h-full flex items-center justify-center bg-slate-50 p-8 text-center">
                  <div className="max-w-sm">
                    <div className="mx-auto h-12 w-12 rounded-2xl bg-white border border-slate-200 text-teal-700 flex items-center justify-center shadow-xs">
                      <Lock className="h-5 w-5" />
                    </div>
                    <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
                      Select a conversation
                    </h2>
                    <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                      Choose an existing encrypted thread from the sidebar or open the User
                      Directory to start a new 1-to-1 end-to-end encrypted chat.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('people')}
                      className="mt-5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      Find Registered Users
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'people' && (
          <div className="flex-1 h-full overflow-hidden">
            <UserDirectory
              onStartConversation={handleStartConversation}
              onInspectContactSecurity={handleInspectSecurity}
            />
          </div>
        )}

        {activeTab === 'security' && (
          <div className="flex-1 h-full overflow-hidden">
            <SecurityDetailsView initialContact={securityContact} />
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="flex-1 h-full overflow-hidden">
            <ProfileView />
          </div>
        )}
      </main>
    </div>
  );
}
