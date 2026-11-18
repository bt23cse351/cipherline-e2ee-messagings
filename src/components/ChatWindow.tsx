import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCheck,
  Code2,
  Lock,
  Send,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  encryptAndSignMessage,
  verifyAndDecryptMessage,
} from '../crypto/e2ee';
import { api } from '../services/api';
import type {
  ConversationSummary,
  DecryptedMessageItem,
  EncryptedMessageEnvelope,
  PublicUser,
} from '../types/messaging';
import { Avatar } from './Avatar';
import { CryptoInspectorModal } from './CryptoInspectorModal';

interface ChatWindowProps {
  conversation: ConversationSummary;
  incomingMessages: EncryptedMessageEnvelope[];
  onBackMobile: () => void;
  onInspectPeerSecurity: (peer: PublicUser) => void;
  onMessageSentOrReceived: (msg: EncryptedMessageEnvelope) => void;
}

export function ChatWindow({
  conversation,
  incomingMessages,
  onBackMobile,
  onInspectPeerSecurity,
  onMessageSentOrReceived,
}: ChatWindowProps) {
  const { user, token, keyBundle, socket, socketConnected, verifiedContacts } = useAuth();
  const [envelopes, setEnvelopes] = useState<EncryptedMessageEnvelope[]>([]);
  const [decryptedItems, setDecryptedItems] = useState<DecryptedMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [inspectedItem, setInspectedItem] = useState<DecryptedMessageItem | null>(null);
  const [peerProfile, setPeerProfile] = useState<PublicUser | undefined>(conversation.peer);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPeerProfile(conversation.peer);
  }, [conversation.peer]);

  // Fetch conversation history + latest peer public keys
  useEffect(() => {
    if (!token || !conversation.peer?.id) return;
    let active = true;
    setLoading(true);
    setLoadError('');

    const peerId = conversation.peer.id;
    const loadHistory = async () => {
      try {
        const [msgsRes, peerRes] = await Promise.all([
          api.getMessages(token, conversation.id),
          api.getUserById(token, peerId),
        ]);
        if (!active) return;
        if (peerRes?.user) {
          setPeerProfile(peerRes.user);
        }
        setEnvelopes(msgsRes.messages);
      } catch (err) {
        if (active) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load message history');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadHistory();

    if (socket && socketConnected) {
      socket.emit('conversation:join', { conversationId: conversation.id });
    }

    return () => {
      active = false;
    };
  }, [conversation.id, conversation.peer?.id, socket, socketConnected, token]);

  // Merge live incoming / updated envelopes idempotently
  useEffect(() => {
    if (incomingMessages.length === 0) return;
    setEnvelopes((prev) => {
      const map = new Map<string, EncryptedMessageEnvelope>();
      for (const m of prev) {
        map.set(m.messageId, m);
      }
      let changed = false;
      for (const incoming of incomingMessages) {
        if (incoming.conversationId !== conversation.id) continue;
        const existing = map.get(incoming.messageId);
        if (
          !existing ||
          existing.deliveredAt !== incoming.deliveredAt ||
          existing.readAt !== incoming.readAt
        ) {
          map.set(incoming.messageId, { ...existing, ...incoming });
          changed = true;
        }
      }
      if (!changed) return prev;
      return Array.from(map.values()).sort(
        (a, b) =>
          new Date(a.clientTimestamp).getTime() - new Date(b.clientTimestamp).getTime()
      );
    });
  }, [conversation.id, incomingMessages]);

  // Verify Ed25519 signature and decrypt all envelopes client-side
  useEffect(() => {
    let active = true;
    const processAll = async () => {
      if (!user) return;
      if (!keyBundle) {
        setDecryptedItems(
          envelopes.map((envelope) => ({
            envelope,
            plaintext: '',
            signatureValid: false,
            decryptionOk: false,
            errorType: 'VAULT_LOCKED',
            securityError: 'Unlock your local key vault to verify and decrypt this message.',
          }))
        );
        return;
      }

      if (!peerProfile) return;

      const items = await Promise.all(
        envelopes.map(async (envelope): Promise<DecryptedMessageItem> => {
          const senderSignPub =
            envelope.senderId === user.id
              ? keyBundle.signingPublicKey
              : peerProfile.signingPublicKey;

          const res = await verifyAndDecryptMessage({
            envelope,
            myUserId: user.id,
            myKeys: keyBundle,
            senderSigningPublicKey: senderSignPub,
            peerEncryptionPublicKey: peerProfile.encryptionPublicKey,
          });

          if (!res.ok && res.errorType === 'SIGNATURE_INVALID' && token) {
            api.reportSignatureWarning(token, envelope.messageId).catch(() => {});
          }

          return {
            envelope,
            plaintext: res.plaintext,
            signatureValid: res.signatureValid,
            decryptionOk: res.ok,
            securityError: res.error,
            errorType: res.errorType,
          };
        })
      );

      if (active) {
        setDecryptedItems(items);
      }
    };

    processAll();
    return () => {
      active = false;
    };
  }, [envelopes, keyBundle, peerProfile, token, user]);

  // Send read receipts for unread incoming messages in this open chat
  useEffect(() => {
    if (!user || !token) return;
    const unreadIncoming = envelopes.filter(
      (m) => m.recipientId === user.id && !m.readAt
    );
    if (unreadIncoming.length === 0) return;

    for (const msg of unreadIncoming) {
      if (socket && socketConnected) {
        socket.emit('message:read', { messageId: msg.messageId });
      } else {
        api.markMessageRead(token, msg.messageId).catch(() => {});
      }
      setEnvelopes((prev) =>
        prev.map((item) =>
          item.messageId === msg.messageId
            ? { ...item, readAt: new Date().toISOString() }
            : item
        )
      );
    }
  }, [envelopes, socket, socketConnected, token, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [decryptedItems.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !user || !token || !keyBundle || !peerProfile) return;

    const text = draft.trim();
    setSending(true);
    setSendError('');

    try {
      const envelope = await encryptAndSignMessage({
        plaintext: text,
        conversationId: conversation.id,
        senderId: user.id,
        recipientId: peerProfile.id,
        senderKeys: keyBundle,
        recipientPublicKeys: {
          encryptionPublicKey: peerProfile.encryptionPublicKey,
          signingPublicKey: peerProfile.signingPublicKey,
          keyVersion: peerProfile.keyVersion,
        },
      });

      if (socket && socketConnected) {
        const persisted = await new Promise<EncryptedMessageEnvelope>((resolve, reject) => {
          socket.emit(
            'message:send',
            envelope,
            (ack: { ok: boolean; message?: EncryptedMessageEnvelope; error?: string }) => {
              if (ack?.ok && ack.message) {
                resolve(ack.message);
              } else {
                reject(new Error(ack?.error || 'Socket delivery failed'));
              }
            }
          );
        });
        setEnvelopes((prev) => [...prev, persisted]);
        onMessageSentOrReceived(persisted);
      } else {
        const res = await api.sendMessageRest(token, envelope);
        setEnvelopes((prev) => [...prev, res.message]);
        onMessageSentOrReceived(res.message);
      }

      setDraft('');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to encrypt or send message');
    } finally {
      setSending(false);
    }
  };

  if (!peerProfile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <p className="text-sm font-medium text-slate-900">Contact unavailable</p>
        <p className="mt-1 text-xs text-slate-500">
          This conversation participant could not be loaded.
        </p>
        <button
          type="button"
          onClick={onBackMobile}
          className="mt-4 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
        >
          Back to Chats
        </button>
      </div>
    );
  }

  const verifiedRecord = verifiedContacts[peerProfile.id];
  const isFingerprintVerified =
    Boolean(verifiedRecord) && verifiedRecord.fingerprint === peerProfile.fingerprint;
  const keyChangedSinceVerification =
    Boolean(verifiedRecord) && verifiedRecord.fingerprint !== peerProfile.fingerprint;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Chat Header */}
      <header className="px-4 sm:px-6 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackMobile}
            className="md:hidden p-1.5 -ml-1.5 text-slate-600 hover:text-slate-900 rounded-lg"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Avatar username={peerProfile.username} isOnline={peerProfile.isOnline} showPresence />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900 truncate">
                @{peerProfile.username}
              </h2>
              <span className="text-xs text-slate-500 whitespace-nowrap">
                · {peerProfile.isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <Lock className="h-3 w-3 text-teal-700 shrink-0" />
              <span className="truncate">
                X25519 · XChaCha20-Poly1305 · Ed25519 Signed
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onInspectPeerSecurity(peerProfile)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            keyChangedSinceVerification
              ? 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100'
              : isFingerprintVerified
                ? 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          {keyChangedSinceVerification ? (
            <ShieldAlert className="h-3.5 w-3.5 text-red-700" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5 text-teal-700" />
          )}
          <span>
            {keyChangedSinceVerification
              ? 'Key Changed'
              : isFingerprintVerified
                ? 'Verified Key'
                : 'Verify Safety Number'}
          </span>
        </button>
      </header>

      {/* Security Banners */}
      {keyChangedSinceVerification && (
        <div className="px-4 sm:px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
            <span>
              Security Notice: @{peerProfile.username}&apos;s public key fingerprint has changed
              (now Key v{peerProfile.keyVersion}). Verify their Safety Number out-of-band before
              sending sensitive information.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onInspectPeerSecurity(peerProfile)}
            className="text-xs font-medium underline whitespace-nowrap"
          >
            Inspect Key
          </button>
        </div>
      )}

      {!socketConnected && (
        <div className="px-4 sm:px-6 py-2 bg-slate-800 text-white text-xs flex items-center justify-between">
          <span>Real-time socket disconnected. Reconnecting automatically...</span>
        </div>
      )}

      {/* Messages Viewport */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-3">
        <div className="max-w-md mx-auto text-center py-2 px-3 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-500">
          Messages in this chat are encrypted end-to-end on your device and signed with
          Ed25519. Click the code icon on any message to inspect its stored ciphertext.
        </div>

        {loadError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={`flex ${n % 2 === 0 ? 'justify-end' : 'justify-start'}`}
              >
                <div className="h-12 w-56 rounded-xl bg-slate-200/70 animate-pulse" />
              </div>
            ))}
          </div>
        ) : decryptedItems.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            No messages yet. Send an encrypted message below to start the conversation.
          </div>
        ) : (
          decryptedItems.map((item) => {
            const { envelope, plaintext, signatureValid, decryptionOk, securityError } = item;
            const isMine = envelope.senderId === user?.id;
            const timeLabel = new Date(envelope.clientTimestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={envelope.messageId}
                className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`group max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-xs border ${
                    !signatureValid
                      ? 'bg-red-50 border-red-300 text-red-950'
                      : !decryptionOk
                        ? 'bg-amber-50 border-amber-200 text-amber-950'
                        : isMine
                          ? 'bg-teal-800 border-teal-800 text-white'
                          : 'bg-white border-slate-200 text-slate-900'
                  }`}
                >
                  {!signatureValid ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-red-800">
                        <ShieldAlert className="h-4 w-4 shrink-0" />
                        <span>Signature Verification Failed</span>
                      </div>
                      <p className="text-xs text-red-800 leading-relaxed">
                        {securityError ||
                          'Message rejected before decryption because the Ed25519 signature is invalid.'}
                      </p>
                    </div>
                  ) : !decryptionOk ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-900">
                        <Lock className="h-3.5 w-3.5 shrink-0" />
                        <span>Unable to Decrypt</span>
                      </div>
                      <p className="text-xs text-amber-800">{securityError}</p>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                      {plaintext}
                    </p>
                  )}

                  <div
                    className={`mt-1.5 flex items-center justify-end gap-2 text-[11px] tabular-nums ${
                      !signatureValid
                        ? 'text-red-700'
                        : !decryptionOk
                          ? 'text-amber-700'
                          : isMine
                            ? 'text-teal-100/80'
                            : 'text-slate-400'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setInspectedItem(item)}
                      className="opacity-75 hover:opacity-100 inline-flex items-center gap-1"
                      title="Inspect cryptographic envelope"
                    >
                      <Code2 className="h-3 w-3" />
                    </button>
                    <span>{timeLabel}</span>
                    {isMine && (
                      <span
                        title={
                          envelope.readAt
                            ? 'Read'
                            : envelope.deliveredAt
                              ? 'Delivered'
                              : 'Sent'
                        }
                      >
                        {envelope.readAt ? (
                          <CheckCheck className="h-3.5 w-3.5 text-sky-300" />
                        ) : envelope.deliveredAt ? (
                          <CheckCheck className="h-3.5 w-3.5" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSend}
        className="p-3 sm:p-4 bg-white border-t border-slate-200 shrink-0 space-y-2"
      >
        {sendError && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
            {sendError}
          </div>
        )}
        <div className="flex items-end gap-2.5">
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            disabled={!keyBundle || sending}
            placeholder={
              keyBundle
                ? `Write an encrypted message to @${peerProfile.username}...`
                : 'Unlock key vault to send messages...'
            }
            className="flex-1 resize-none px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white max-h-32"
          />
          <button
            type="submit"
            disabled={!draft.trim() || !keyBundle || sending}
            className="h-10 px-4 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-medium rounded-xl transition-colors flex items-center gap-1.5 shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
            <span>{sending ? 'Encrypting...' : 'Send'}</span>
          </button>
        </div>
      </form>

      <CryptoInspectorModal
        item={inspectedItem}
        onClose={() => setInspectedItem(null)}
      />
    </div>
  );
}
