import type { Response } from 'express';
import mongoose from 'mongoose';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { Conversation } from '../models/Conversation.ts';
import { Message } from '../models/Message.ts';
import { User } from '../models/User.ts';
import { logSecurityEvent } from '../utils/securityLogger.ts';
import { createConversationSchema } from '../utils/validation.ts';

export async function createOrGetConversation(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const parsed = createConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid recipient ID',
    });
    return;
  }

  const currentUserId = req.user.id;
  const { recipientId } = parsed.data;

  if (currentUserId === recipientId) {
    res.status(400).json({ error: 'Cannot start a conversation with yourself' });
    return;
  }

  const recipient = await User.findById(recipientId).lean();
  if (!recipient) {
    res.status(404).json({ error: 'Recipient user not found' });
    return;
  }

  const sortedPair = [currentUserId, recipientId].sort();
  const participantPairKey = `${sortedPair[0]}:${sortedPair[1]}`;

  let conversation = await Conversation.findOne({ participantPairKey });
  let created = false;

  if (!conversation) {
    conversation = await Conversation.create({
      participants: sortedPair.map((id) => new mongoose.Types.ObjectId(id)),
      participantPairKey,
      lastMessageAt: null,
    });
    created = true;

    await logSecurityEvent({
      userId: currentUserId,
      action: 'CONVERSATION_CREATE',
      result: 'SUCCESS',
      detail: `Encrypted 1-to-1 channel initialized with @${recipient.username}`,
    });
  }

  const populated = await Conversation.findById(conversation._id)
    .populate(
      'participants',
      'username encryptionPublicKey signingPublicKey fingerprint keyVersion isOnline lastSeen'
    )
    .lean();

  if (!populated) {
    res.status(500).json({ error: 'Failed to load conversation' });
    return;
  }

  const participants = (populated.participants as unknown as Array<{
    _id: unknown;
    username: string;
    encryptionPublicKey: string;
    signingPublicKey: string;
    fingerprint: string;
    keyVersion: number;
    isOnline: boolean;
    lastSeen: Date;
  } | null>)
    .filter((p): p is NonNullable<typeof p> => Boolean(p && p._id))
    .map((p) => ({
      id: String(p._id),
      username: p.username,
      encryptionPublicKey: p.encryptionPublicKey,
      signingPublicKey: p.signingPublicKey,
      fingerprint: p.fingerprint,
      keyVersion: p.keyVersion,
      isOnline: p.isOnline,
      lastSeen: p.lastSeen,
    }));

  const peer = participants.find((p) => p.id !== currentUserId) ||
    participants[0] || {
      id: recipientId,
      username: recipient.username,
      encryptionPublicKey: recipient.encryptionPublicKey,
      signingPublicKey: recipient.signingPublicKey,
      fingerprint: recipient.fingerprint,
      keyVersion: recipient.keyVersion,
      isOnline: recipient.isOnline,
      lastSeen: recipient.lastSeen,
    };

  res.status(created ? 201 : 200).json({
    conversation: {
      id: String(populated._id),
      participants,
      peer,
      lastMessageAt: populated.lastMessageAt,
      createdAt: populated.createdAt,
      updatedAt: populated.updatedAt,
      lastMessage: null,
      unreadCount: 0,
    },
  });
}

export async function listConversations(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const currentUserId = req.user.id;

  const conversations = await Conversation.find({
    participants: new mongoose.Types.ObjectId(currentUserId),
  })
    .populate(
      'participants',
      'username encryptionPublicKey signingPublicKey fingerprint keyVersion isOnline lastSeen'
    )
    .sort({ updatedAt: -1 })
    .lean();

  const enriched = await Promise.all(
    conversations.map(async (conv) => {
      const [lastMessage, unreadCount] = await Promise.all([
        Message.findOne({ conversationId: conv._id })
          .sort({ createdAt: -1 })
          .lean(),
        Message.countDocuments({
          conversationId: conv._id,
          recipientId: new mongoose.Types.ObjectId(currentUserId),
          readAt: null,
        }),
      ]);

      const participants = (conv.participants as unknown as Array<{
        _id: unknown;
        username: string;
        encryptionPublicKey: string;
        signingPublicKey: string;
        fingerprint: string;
        keyVersion: number;
        isOnline: boolean;
        lastSeen: Date;
      } | null>)
        .filter((p): p is NonNullable<typeof p> => Boolean(p && p._id))
        .map((p) => ({
          id: String(p._id),
          username: p.username,
          encryptionPublicKey: p.encryptionPublicKey,
          signingPublicKey: p.signingPublicKey,
          fingerprint: p.fingerprint,
          keyVersion: p.keyVersion,
          isOnline: p.isOnline,
          lastSeen: p.lastSeen,
        }));

      const peer = participants.find((p) => p.id !== currentUserId) || participants[0];
      if (!peer) {
        return null;
      }

      return {
        id: String(conv._id),
        participants,
        peer,
        lastMessageAt: conv.lastMessageAt,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        unreadCount,
        lastMessage: lastMessage
          ? {
              id: String(lastMessage._id),
              messageId: lastMessage.messageId,
              conversationId: String(lastMessage.conversationId),
              senderId: String(lastMessage.senderId),
              recipientId: String(lastMessage.recipientId),
              ciphertext: lastMessage.ciphertext,
              nonce: lastMessage.nonce,
              ephemeralPublicKey: lastMessage.ephemeralPublicKey,
              signature: lastMessage.signature,
              keyVersion: lastMessage.keyVersion,
              senderKeyVersion: lastMessage.senderKeyVersion,
              recipientKeyVersion: lastMessage.recipientKeyVersion,
              clientTimestamp: lastMessage.clientTimestamp,
              deliveredAt: lastMessage.deliveredAt,
              readAt: lastMessage.readAt,
              createdAt: lastMessage.createdAt,
            }
          : null,
      };
    })
  );

  res.status(200).json({ conversations: enriched.filter(Boolean) });
}
