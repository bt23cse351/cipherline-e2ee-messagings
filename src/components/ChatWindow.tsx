import {
  Check,
  CheckCheck,
  Eye,
  KeyRound,
  Lock,
  Send,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import {
  computeSafetyNumber,
  encryptAndSignMessage,
  formatFingerprint,
  verifyAndDecryptMessage,
} from '../crypto/e2ee';
import { api } from '../services/api';
import type {
  ConversationSummary,
  DecryptedMessage,
  EncryptedMessageEnvelope,
  UserProfile,
} from '../types/messaging';
import { Avatar } from './Avatar';
import { CryptoInspectorModal } from './CryptoInspectorModal';
import { EncryptedHandshakeGraphic } from './GraphicsPrimitives';

interface ChatWindowProps {
  conversation: ConversationSummary;
  socket: Socket | null;
  onUnlockVaultClick: () => void;
  onConversationActivity: (conversationId: string, envelope: EncryptedMessageEnvelope) => void;
}

export function ChatWindow({
  conversation,
  socket,
  onUnlockVaultClick,
  onConversationActivity,
}: ChatWindowProps) {
  const {
    user,
    token,
    identityKeys,
    verifiedContacts,
    markContactVerified,
    unverifyContact,
  } = useAuth();

  const [peerProfile, setPeerProfile] = useState<UserProfile | null>(conversation.peer || null);
  const [envelopes, setEnvelopes] = useState<EncryptedMessageEnvelope[]>([]);
  const [decryptedMessages, setDecryptedMessages] = useState<DecryptedMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFingerprintDrawer, setShowFingerprintDrawer] = useState(false);
  const [safetyNumber, setSafetyNumber] = useState('');
  const [inspectedMessage, setInspectedMessage] = useState<DecryptedMessage | null>(null);

  const reportedSigWarningsRef = useRef<Set<string>>(new Set());
  const readReceiptSentRef = useRef<Set<string>>(new Set());
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const peerId = conversation.peer?.id || '';

  useEffect(() => {
    setPeerProfile(conversation.peer || null);
    setError(null);
  }, [conversation]);

  useEffect(() => {
    if (!token || !peerId) return;
    let active = true;
    api
      .getUserById(token, peerId)
      .then(({ user: freshPeer }) => {
        if (active && freshPeer?.id) {
          setPeerProfile(freshPeer);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token, peerId]);

  useEffect(() => {
    const myFp = identityKeys?.fingerprint || user?.fingerprint || '';
    const peerFp = peerProfile?.fingerprint || '';
    if (!myFp || !peerFp) {
      setSafetyNumber('');
      return;
    }
    void computeSafetyNumber(myFp, peerFp).then(setSafetyNumber);
  }, [identityKeys?.fingerprint, user?.fingerprint, peerProfile?.fingerprint]);

  useEffect(() => {
    if (!token || !conversation.id) return;
    let active = true;
    setLoadingMessages(true);

    api
      .getMessages(token, conversation.id)
      .then(({ messages }) => {
        if (active) {
          setEnvelopes(messages);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to load encrypted messages');
        }
      })
      .finally(() => {
        if (active) setLoadingMessages(false);
      });

    return () => {
      active = false;
    };
  }, [token, conversation.id]);

  useEffect(() => {
    if (!socket || !conversation.id) return;

    socket.emit('conversation:join', conversation.id);

    const handleNewMessage = (incoming: EncryptedMessageEnvelope) => {
      if (incoming.conversationId !== conversation.id) return;
      setEnvelopes((prev) => {
        if (prev.some((m) => m.messageId === incoming.messageId)) {
          return prev;
        }
        return [...prev, incoming];
      });
      if (user && incoming.recipientId === user.id) {
        socket.emit('message:delivered', {
          id: incoming.id,
          messageId: incoming.messageId,
        });
      }
    };

    const handleDelivered = (ack: {
      id?: string;
      messageId: string;
      conversationId: string;
      deliveredAt: string;
    }) => {
      if (ack.conversationId !== conversation.id) return;
      setEnvelopes((prev) =>
        prev.map((m) =>
          m.messageId === ack.messageId ? { ...m, deliveredAt: ack.deliveredAt } : m
        )
      );
    };

    const handleRead = (ack: {
      id?: string;
      messageId: string;
      conversationId: string;
      deliveredAt: string;
      readAt: string;
    }) => {
      if (ack.conversationId !== conversation.id) return;
      setEnvelopes((prev) =>
        prev.map((m) =>
          m.messageId === ack.messageId
            ? { ...m, deliveredAt: ack.deliveredAt, readAt: ack.readAt }
            : m
        )
      );
    };

    const handleUserOnline = (evt: { userId: string; lastSeen: string }) => {
      if (evt.userId === peerId) {
        setPeerProfile((prev) =>
          prev ? { ...prev, isOnline: true, lastSeen: evt.lastSeen } : prev
        );
      }
    };

    const handleUserOffline = (evt: { userId: string; lastSeen: string }) => {
      if (evt.userId === peerId) {
        setPeerProfile((prev) =>
          prev ? { ...prev, isOnline: false, lastSeen: evt.lastSeen } : prev
        );
      }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:delivered', handleDelivered);
    socket.on('message:read', handleRead);
    socket.on('user:online', handleUserOnline);
    socket.on('user:offline', handleUserOffline);

    return () => {
      socket.emit('conversation:leave', conversation.id);
      socket.off('message:new', handleNewMessage);
      socket.off('message:delivered', handleDelivered);
      socket.off('message:read', handleRead);
      socket.off('user:online', handleUserOnline);
      socket.off('user:offline', handleUserOffline);
    };
  }, [socket, conversation.id, peerId, user]);

  useEffect(() => {
    let active = true;

    async function decryptAll() {
      if (!user) return;
      if (!identityKeys) {
        if (active) {
          setDecryptedMessages(
            envelopes.map((envelope) => ({
              envelope,
              plaintext: '',
              status: 'LOCKED',
              errorReason: 'Unlock your local key vault to decrypt messages.',
            }))
          );
        }
        return;
      }

      const peerEncPub = peerProfile?.encryptionPublicKey || '';
      const peerSignPub = peerProfile?.signingPublicKey || '';

      const results = await Promise.all(
        envelopes.map(async (envelope): Promise<DecryptedMessage> => {
          const isOutgoing = envelope.senderId === user.id;
          const senderSignPub = isOutgoing ? identityKeys.signingPublicKey : peerSignPub;

          const res = await verifyAndDecryptMessage({
            envelope,
            myEncPrivateKeyB64: identityKeys.encryptionPrivateKey,
            peerEncPublicKeyB64: peerEncPub,
            senderSignPublicKeyB64: senderSignPub,
          });

          if (
            !res.ok &&
            res.status === 'SIGNATURE_INVALID' &&
            token &&
            !reportedSigWarningsRef.current.has(envelope.messageId)
          ) {
            reportedSigWarningsRef.current.add(envelope.messageId);
            void api.reportSignatureWarning(token, envelope.messageId).catch(() => {});
          }

          return {
            envelope,
            plaintext: res.plaintext,
            status: res.status,
            errorReason: res.errorReason,
          };
        })
      );

      if (active) {
        setDecryptedMessages(results);
      }
    }

    void decryptAll();
    return () => {
      active = false;
    };
  }, [
    envelopes,
    identityKeys,
    user,
    token,
    peerProfile?.encryptionPublicKey,
    peerProfile?.signingPublicKey,
  ]);

  useEffect(() => {
    if (!user || !token || !identityKeys) return;
    const unreadIncoming = envelopes.filter(
      (m) =>
        m.recipientId === user.id &&
        !m.readAt &&
        !readReceiptSentRef.current.has(m.messageId)
    );

    unreadIncoming.forEach((msg) => {
      readReceiptSentRef.current.add(msg.messageId);
      const targetId = msg.id || msg.messageId;
      if (socket?.connected) {
        socket.emit('message:read', { id: msg.id, messageId: msg.messageId });
      } else {
        void api.markMessageRead(token, targetId).catch(() => {});
      }
    });
  }, [envelopes, user, token, identityKeys, socket]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [decryptedMessages.length]);

  const activePeer = peerProfile || conversation.peer;
  const isVerified = useMemo(() => {
    if (!activePeer?.id) return false;
    const record = verifiedContacts[activePeer.id];
    return Boolean(record && record.fingerprint === activePeer.fingerprint);
  }, [verifiedContacts, activePeer]);

  const keyChangedWarning = useMemo(() => {
    if (!activePeer?.id) return false;
    const record = verifiedContacts[activePeer.id];
    return Boolean(record && record.fingerprint !== activePeer.fingerprint);
  }, [verifiedContacts, activePeer]);

  const handleSend = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!user || !token || !identityKeys || !activePeer?.id) return;

      const text = draft.trim();
      if (!text) return;

      if (!activePeer.encryptionPublicKey || !activePeer.signingPublicKey) {
        setError('Recipient has not published their X25519/Ed25519 public keys yet.');
        return;
      }

      setSending(true);
      setError(null);

      try {
        const envelope = await encryptAndSignMessage({
          plaintext: text,
          conversationId: conversation.id,
          senderId: user.id,
          recipientId: activePeer.id,
          senderKeys: identityKeys,
          recipientEncryptionPublicKey: activePeer.encryptionPublicKey,
          recipientKeyVersion: activePeer.keyVersion || 1,
        });

        let savedEnvelope: EncryptedMessageEnvelope;
        if (socket?.connected) {
          savedEnvelope = await new Promise<EncryptedMessageEnvelope>((resolve, reject) => {
            socket.emit(
              'message:send',
              envelope,
              (ack: { ok?: boolean; error?: string; message?: EncryptedMessageEnvelope }) => {
                if (ack?.ok && ack.message) {
                  resolve(ack.message);
                } else {
                  reject(new Error(ack?.error || 'Socket send failed'));
                }
              }
            );
          });
        } else {
          const res = await api.sendMessage(token, envelope);
          savedEnvelope = res.message;
        }

        setEnvelopes((prev) => {
          if (prev.some((m) => m.messageId === savedEnvelope.messageId)) {
            return prev;
          }
          return [...prev, savedEnvelope];
        });
        onConversationActivity(conversation.id, savedEnvelope);
        setDraft('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to encrypt and transmit message');
      } finally {
        setSending(false);
      }
    },
    [user, token, identityKeys, activePeer, draft, conversation.id, socket, onConversationActivity]
  );

  if (!activePeer?.id) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center">
        <p className="text-sm text-slate-500">Select a conversation to view encrypted messages.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar username={activePeer.username} isOnline={activePeer.isOnline} size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900 truncate">
                @{activePeer.username}
              </h2>
              {isVerified ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 whitespace-nowrap">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Verified</span>
                </span>
              ) : keyChangedWarning ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 whitespace-nowrap">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Key Changed</span>
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-500 truncate">
              {activePeer.isOnline ? 'Online' : 'Offline'} · X25519 + XChaCha20-Poly1305 · Ed25519
              Signed
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowFingerprintDrawer((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors whitespace-nowrap shrink-0"
        >
          <KeyRound className="w-3.5 h-3.5 text-teal-700" />
          <span>{showFingerprintDrawer ? 'Hide Keys' : 'Verify Keys'}</span>
        </button>
      </div>

      {keyChangedWarning && (
        <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-3">
          <span>
            @{activePeer.username}&apos;s public key fingerprint changed since you last verified
            them. Re-check their safety number out-of-band before sharing sensitive information.
          </span>
          <button
            type="button"
            onClick={() => setShowFingerprintDrawer(true)}
            className="font-semibold text-amber-900 underline whitespace-nowrap shrink-0"
          >
            Inspect Key
          </button>
        </div>
      )}

      {showFingerprintDrawer && (
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-600">
                @{activePeer.username} SHA-256 Public Key Fingerprint (v{activePeer.keyVersion})
              </p>
              <p className="text-xs font-mono text-slate-900 bg-white p-2.5 rounded-lg border border-slate-200 break-all">
                {formatFingerprint(activePeer.fingerprint)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-600">
                Symmetric 60-Digit Safety Number
              </p>
              <p className="text-xs font-mono text-slate-900 bg-white p-2.5 rounded-lg border border-slate-200 break-words">
                {safetyNumber || 'Unlock your vault to compute safety number'}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-slate-500">
              Compare these digits in person or via a trusted voice call to rule out MITM key
              substitution.
            </p>
            {isVerified ? (
              <button
                type="button"
                onClick={() => unverifyContact(activePeer.id)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                Clear Verification
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void markContactVerified(activePeer)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Mark Fingerprint Verified</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-chat-canvas">
        {!identityKeys && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900">
                <p className="font-semibold">Local private key vault is locked</p>
                <p className="mt-0.5">
                  Unlock your vault passphrase to decrypt existing messages and sign outgoing chats.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onUnlockVaultClick}
              className="px-3.5 py-2 text-xs font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 whitespace-nowrap shrink-0"
            >
              Unlock Vault
            </button>
          </div>
        )}

        {loadingMessages ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 w-2/3 rounded-xl bg-slate-200/70 animate-pulse" />
            ))}
          </div>
        ) : decryptedMessages.length === 0 ? (
          <div className="py-14 text-center max-w-sm mx-auto space-y-3 bg-white/90 border border-slate-200 rounded-xl p-6">
            <EncryptedHandshakeGraphic />
            <p className="text-sm font-semibold text-slate-900">End-to-End Encrypted Channel</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Messages sent here are encrypted with XChaCha20-Poly1305 and signed with Ed25519
              before leaving your browser.
            </p>
          </div>
        ) : (
          decryptedMessages.map((item) => {
            const isMine = item.envelope.senderId === user?.id;
            const timeLabel = new Date(
              item.envelope.clientTimestamp || item.envelope.createdAt || Date.now()
            ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <div
                key={item.envelope.messageId}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[80%] sm:max-w-[70%] rounded-xl px-4 py-2.5 border shadow-xs ${
                    item.status === 'SIGNATURE_INVALID' || item.status === 'CIPHERTEXT_TAMPERED'
                      ? 'bg-rose-50 border-rose-300 text-rose-900'
                      : isMine
                      ? 'bg-gradient-to-br from-teal-700 to-cyan-700 border-teal-800/30 text-white'
                      : 'bg-white border-sky-200/80 text-slate-900'
                  }`}
                >
                  {item.status === 'VERIFIED' ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {item.plaintext}
                    </p>
                  ) : item.status === 'LOCKED' ? (
                    <p className="text-xs italic opacity-80">
                      Encrypted message (unlock key vault to decrypt)
                    </p>
                  ) : (
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-rose-700">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Tampering or Signature Failure ({item.status})</span>
                      </div>
                      <p className="text-rose-800">{item.errorReason}</p>
                    </div>
                  )}

                  <div
                    className={`mt-1.5 flex items-center justify-between gap-4 text-xs tabular-nums ${
                      item.status === 'SIGNATURE_INVALID' || item.status === 'CIPHERTEXT_TAMPERED'
                        ? 'text-rose-700'
                        : isMine
                        ? 'text-teal-100'
                        : 'text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{timeLabel}</span>
                      {item.status === 'VERIFIED' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Signed</span>
                        </>
                      )}
                      {isMine && (
                        <span
                          className="inline-flex items-center"
                          title={
                            item.envelope.readAt
                              ? 'Read'
                              : item.envelope.deliveredAt
                              ? 'Delivered'
                              : 'Sent'
                          }
                        >
                          {item.envelope.readAt ? (
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-300" />
                          ) : item.envelope.deliveredAt ? (
                            <CheckCheck className="w-3.5 h-3.5 text-teal-200" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-teal-200" />
                          )}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setInspectedMessage(item)}
                      className={`inline-flex items-center gap-1 text-xs hover:underline whitespace-nowrap ${
                        isMine
                          ? 'text-teal-100 hover:text-white'
                          : 'text-teal-700 hover:text-teal-900'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      <span>Inspect</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messageEndRef} />
      </div>

      {error && (
        <div className="px-6 py-2 bg-rose-50 border-t border-rose-200 text-xs text-rose-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSend} className="p-4 border-t border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!identityKeys || sending}
            placeholder={
              identityKeys
                ? `Encrypt and send message to @${activePeer.username}...`
                : 'Unlock local key vault to compose messages...'
            }
            className="flex-1 px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!identityKeys || sending || !draft.trim()}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-teal-600 to-cyan-600 rounded-lg hover:from-teal-700 hover:to-cyan-700 disabled:opacity-50 transition-all shadow-xs whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{sending ? 'Encrypting...' : 'Send Encrypted'}</span>
          </button>
        </div>
      </form>

      {inspectedMessage && (
        <CryptoInspectorModal
          message={inspectedMessage}
          senderUsername={
            inspectedMessage.envelope.senderId === user?.id
              ? user.username
              : activePeer.username
          }
          recipientUsername={
            inspectedMessage.envelope.recipientId === user?.id
              ? user.username
              : activePeer.username
          }
          onClose={() => setInspectedMessage(null)}
        />
      )}
    </div>
  );
}
