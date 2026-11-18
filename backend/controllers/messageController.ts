import type { Response } from 'express';
import mongoose from 'mongoose';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { Conversation } from '../models/Conversation.ts';
import { Message, type IMessage } from '../models/Message.ts';
import { SecurityLog } from '../models/SecurityLog.ts';
import { getIO, isUserOnline } from '../sockets/chatSocket.ts';
import { logSecurityEvent } from '../utils/securityLogger.ts';
import { isValidObjectId, sendMessageSchema } from '../utils/validation.ts';

export function serializeMessage(msg: IMessage | (Record<string, unknown> & { _id: unknown })) {
  const m = msg as unknown as {
    _id: unknown;
    messageId: string;
    conversationId: unknown;
    senderId: unknown;
    recipientId: unknown;
    ciphertext: string;
    nonce: string;
    ephemeralPublicKey: string;
    signature: string;
    keyVersion: number;
    senderKeyVersion: number;
    recipientKeyVersion: number;
    clientTimestamp: string;
    deliveredAt: Date | null;
    readAt: Date | null;
    createdAt: Date;
  };
  return {
    id: String(m._id),
    messageId: m.messageId,
    conversationId: String(m.conversationId),
    senderId: String(m.senderId),
    recipientId: String(m.recipientId),
    ciphertext: m.ciphertext,
    nonce: m.nonce,
    ephemeralPublicKey: m.ephemeralPublicKey,
    signature: m.signature,
    keyVersion: m.keyVersion,
    senderKeyVersion: m.senderKeyVersion,
    recipientKeyVersion: m.recipientKeyVersion,
    clientTimestamp: m.clientTimestamp,
    deliveredAt: m.deliveredAt,
    readAt: m.readAt,
    createdAt: m.createdAt,
  };
}

export async function getMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const conversationId = String(req.params.conversationId || '');
  if (!isValidObjectId(conversationId)) {
    res.status(400).json({ error: 'Invalid conversation ID' });
    return;
  }

  const conversation = await Conversation.findById(conversationId).lean();
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  const isMember = conversation.participants.some(
    (participantId) => String(participantId) === req.user!.id
  );

  if (!isMember) {
    await logSecurityEvent({
      userId: req.user.id,
      action: 'UNAUTHORIZED_ACCESS',
      result: 'BLOCKED',
      detail: `Blocked unauthorized read of conversation ${conversationId}`,
    });
    res.status(403).json({ error: 'You are not authorized to access this conversation' });
    return;
  }

  const messages = await Message.find({ conversationId })
    .sort({ createdAt: 1 })
    .limit(500)
    .lean();

  res.status(200).json({
    messages: messages.map((msg) => serializeMessage(msg)),
  });
}

export async function sendMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Reject any accidental plaintext payload field
  if ('plaintext' in (req.body as Record<string, unknown>) || 'text' in (req.body as Record<string, unknown>)) {
    res.status(400).json({
      error: 'Plaintext messages are rejected. Encrypt payload client-side before sending.',
    });
    return;
  }

  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid encrypted message envelope',
    });
    return;
  }

  const data = parsed.data;
  const senderId = req.user.id;

  const conversation = await Conversation.findById(data.conversationId);
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  const participantIds = conversation.participants.map((p) => String(p));
  if (!participantIds.includes(senderId)) {
    await logSecurityEvent({
      userId: senderId,
      action: 'UNAUTHORIZED_ACCESS',
      result: 'BLOCKED',
      detail: `Blocked unauthorized message send to conversation ${data.conversationId}`,
    });
    res.status(403).json({ error: 'You are not a participant in this conversation' });
    return;
  }

  const expectedRecipient = participantIds.find((id) => id !== senderId);
  if (!expectedRecipient || expectedRecipient !== data.recipientId) {
    res.status(400).json({ error: 'Recipient does not match conversation participant' });
    return;
  }

  const duplicate = await Message.exists({ messageId: data.messageId });
  if (duplicate) {
    res.status(409).json({ error: 'Duplicate messageId rejected (replay protection)' });
    return;
  }

  const recipientOnline = isUserOnline(data.recipientId);
  const now = new Date();

  const messageDoc = await Message.create({
    messageId: data.messageId,
    conversationId: new mongoose.Types.ObjectId(data.conversationId),
    senderId: new mongoose.Types.ObjectId(senderId),
    recipientId: new mongoose.Types.ObjectId(data.recipientId),
    ciphertext: data.ciphertext,
    nonce: data.nonce,
    ephemeralPublicKey: data.ephemeralPublicKey,
    signature: data.signature,
    keyVersion: data.keyVersion,
    senderKeyVersion: data.senderKeyVersion,
    recipientKeyVersion: data.recipientKeyVersion,
    clientTimestamp: data.clientTimestamp,
    deliveredAt: recipientOnline ? now : null,
    readAt: null,
  });

  conversation.lastMessageAt = now;
  await conversation.save();

  await logSecurityEvent({
    userId: senderId,
    action: 'MESSAGE_SENT',
    result: 'SUCCESS',
    detail: `Encrypted envelope persisted (${data.messageId.slice(0, 8)})`,
  });

  const serialized = serializeMessage(messageDoc);
  const io = getIO();
  if (io) {
    io.to(`user:${data.recipientId}`).emit('message:new', serialized);
    io.to(`conv:${data.conversationId}`).emit('message:new', serialized);
    if (recipientOnline) {
      io.to(`user:${senderId}`).emit('message:delivered', {
        id: serialized.id,
        messageId: serialized.messageId,
        conversationId: serialized.conversationId,
        deliveredAt: now.toISOString(),
      });
    }
  }

  res.status(201).json({ message: serialized });
}

export async function markMessageRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const idParam = String(req.params.id || '');
  const query = isValidObjectId(idParam)
    ? { $or: [{ _id: idParam }, { messageId: idParam }] }
    : { messageId: idParam };

  const message = await Message.findOne(query);
  if (!message) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }

  if (String(message.recipientId) !== req.user.id) {
    await logSecurityEvent({
      userId: req.user.id,
      action: 'UNAUTHORIZED_ACCESS',
      result: 'BLOCKED',
      detail: `Blocked unauthorized read receipt on message ${message.messageId}`,
    });
    res.status(403).json({ error: 'Only the recipient may mark a message as read' });
    return;
  }

  const now = new Date();
  if (!message.deliveredAt) {
    message.deliveredAt = now;
  }
  if (!message.readAt) {
    message.readAt = now;
  }
  await message.save();

  const payload = {
    id: String(message._id),
    messageId: message.messageId,
    conversationId: String(message.conversationId),
    deliveredAt: message.deliveredAt.toISOString(),
    readAt: message.readAt.toISOString(),
  };

  const io = getIO();
  if (io) {
    io.to(`user:${String(message.senderId)}`).emit('message:read', payload);
    io.to(`conv:${String(message.conversationId)}`).emit('message:read', payload);
  }

  res.status(200).json(payload);
}

export async function getSecurityLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const logs = await SecurityLog.find({ userId: req.user.id })
    .sort({ timestamp: -1 })
    .limit(50)
    .lean();

  res.status(200).json({
    logs: logs.map((l) => ({
      id: String(l._id),
      action: l.action,
      result: l.result,
      detail: l.detail,
      timestamp: l.timestamp,
    })),
  });
}

export async function reportSignatureWarning(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const messageId = typeof req.body?.messageId === 'string' ? req.body.messageId.slice(0, 64) : 'unknown';
  await logSecurityEvent({
    userId: req.user.id,
    action: 'SIGNATURE_WARNING',
    result: 'BLOCKED',
    detail: `Client rejected invalid Ed25519 signature for message ${messageId}`,
  });

  res.status(200).json({ recorded: true });
}
