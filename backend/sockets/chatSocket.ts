import type { Server as HttpServer } from 'node:http';
import mongoose from 'mongoose';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { waitForDatabase } from '../config/db.ts';
import { env } from '../config/env.ts';
import { serializeMessage } from '../controllers/messageController.ts';
import { Conversation } from '../models/Conversation.ts';
import { Message } from '../models/Message.ts';
import { User } from '../models/User.ts';
import { verifyAuthToken } from '../utils/jwt.ts';
import { logSecurityEvent } from '../utils/securityLogger.ts';
import { isValidObjectId, sendMessageSchema } from '../utils/validation.ts';

let ioInstance: SocketIOServer | null = null;
const onlineSockets = new Map<string, Set<string>>();

export function getIO(): SocketIOServer | null {
  return ioInstance;
}

export function isUserOnline(userId: string): boolean {
  const sockets = onlineSockets.get(userId);
  return Boolean(sockets && sockets.size > 0);
}

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin:
        env.nodeEnv === 'production' && env.hasExplicitCors ? env.corsOrigins : true,
      credentials: true,
    },
    maxHttpBufferSize: 128 * 1024,
  });

  io.use(async (socket, next) => {
    try {
      const token =
        typeof socket.handshake.auth?.token === 'string'
          ? socket.handshake.auth.token
          : '';
      if (!token) {
        return next(new Error('Authentication token required'));
      }
      const ready = await waitForDatabase(15000);
      if (!ready) {
        return next(new Error('Database initializing, please retry'));
      }
      const payload = await verifyAuthToken(token);
      socket.data.userId = payload.sub;
      socket.data.username = payload.username;
      next();
    } catch {
      next(new Error('Invalid or expired authentication token'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const userId = String(socket.data.userId);
    const username = String(socket.data.username);

    socket.join(`user:${userId}`);

    let userSockets = onlineSockets.get(userId);
    const wasOffline = !userSockets || userSockets.size === 0;
    if (!userSockets) {
      userSockets = new Set<string>();
      onlineSockets.set(userId, userSockets);
    }
    userSockets.add(socket.id);

    if (wasOffline) {
      await User.findByIdAndUpdate(userId, {
        isOnline: true,
        lastSeen: new Date(),
      });
      io.emit('user:online', {
        userId,
        username,
        isOnline: true,
        lastSeen: new Date().toISOString(),
      });
    }

    // Mark undelivered messages addressed to this user as delivered on reconnect
    const pendingUndelivered = await Message.find({
      recipientId: new mongoose.Types.ObjectId(userId),
      deliveredAt: null,
    }).limit(200);

    if (pendingUndelivered.length > 0) {
      const now = new Date();
      await Message.updateMany(
        {
          _id: { $in: pendingUndelivered.map((m) => m._id) },
        },
        { $set: { deliveredAt: now } }
      );

      for (const msg of pendingUndelivered) {
        io.to(`user:${String(msg.senderId)}`).emit('message:delivered', {
          id: String(msg._id),
          messageId: msg.messageId,
          conversationId: String(msg.conversationId),
          deliveredAt: now.toISOString(),
        });
      }
    }

    socket.on(
      'conversation:join',
      async (
        payload: { conversationId?: string },
        ack?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const conversationId = String(payload?.conversationId || '');
          if (!isValidObjectId(conversationId)) {
            ack?.({ ok: false, error: 'Invalid conversation ID' });
            return;
          }

          const conversation = await Conversation.findById(conversationId).lean();
          if (!conversation) {
            ack?.({ ok: false, error: 'Conversation not found' });
            return;
          }

          const isMember = conversation.participants.some(
            (participantId) => String(participantId) === userId
          );

          if (!isMember) {
            await logSecurityEvent({
              userId,
              action: 'UNAUTHORIZED_ACCESS',
              result: 'BLOCKED',
              detail: `Blocked unauthorized socket room join ${conversationId}`,
            });
            ack?.({ ok: false, error: 'Unauthorized conversation access' });
            return;
          }

          await socket.join(`conv:${conversationId}`);
          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false, error: 'Failed to join conversation' });
        }
      }
    );

    socket.on(
      'message:send',
      async (
        rawPayload: unknown,
        ack?: (res: { ok: boolean; message?: ReturnType<typeof serializeMessage>; error?: string }) => void
      ) => {
        try {
          if (
            rawPayload &&
            typeof rawPayload === 'object' &&
            ('plaintext' in rawPayload || 'text' in rawPayload)
          ) {
            ack?.({
              ok: false,
              error: 'Plaintext payload rejected by server. Encrypt client-side.',
            });
            return;
          }

          const parsed = sendMessageSchema.safeParse(rawPayload);
          if (!parsed.success) {
            ack?.({
              ok: false,
              error: parsed.error.issues[0]?.message || 'Invalid message envelope',
            });
            return;
          }

          const data = parsed.data;
          const conversation = await Conversation.findById(data.conversationId);
          if (!conversation) {
            ack?.({ ok: false, error: 'Conversation not found' });
            return;
          }

          const participantIds = conversation.participants.map((p) => String(p));
          if (!participantIds.includes(userId)) {
            await logSecurityEvent({
              userId,
              action: 'UNAUTHORIZED_ACCESS',
              result: 'BLOCKED',
              detail: `Blocked socket message injection into ${data.conversationId}`,
            });
            ack?.({ ok: false, error: 'Not a conversation participant' });
            return;
          }

          const expectedRecipient = participantIds.find((id) => id !== userId);
          if (!expectedRecipient || expectedRecipient !== data.recipientId) {
            ack?.({ ok: false, error: 'Recipient mismatch' });
            return;
          }

          const exists = await Message.exists({ messageId: data.messageId });
          if (exists) {
            ack?.({ ok: false, error: 'Duplicate messageId rejected' });
            return;
          }

          const recipientOnline = isUserOnline(data.recipientId);
          const now = new Date();

          const doc = await Message.create({
            messageId: data.messageId,
            conversationId: new mongoose.Types.ObjectId(data.conversationId),
            senderId: new mongoose.Types.ObjectId(userId),
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
            userId,
            action: 'MESSAGE_SENT',
            result: 'SUCCESS',
            detail: `Encrypted envelope relayed via socket (${data.messageId.slice(0, 8)})`,
          });

          const serialized = serializeMessage(doc);
          io.to(`user:${data.recipientId}`).emit('message:new', serialized);
          io.to(`conv:${data.conversationId}`).emit('message:new', serialized);

          if (recipientOnline) {
            io.to(`user:${userId}`).emit('message:delivered', {
              id: serialized.id,
              messageId: serialized.messageId,
              conversationId: serialized.conversationId,
              deliveredAt: now.toISOString(),
            });
          }

          ack?.({ ok: true, message: serialized });
        } catch {
          ack?.({ ok: false, error: 'Failed to store encrypted message' });
        }
      }
    );

    socket.on(
      'message:delivered',
      async (payload: { messageId?: string }) => {
        try {
          const messageId = String(payload?.messageId || '');
          if (!messageId) return;

          const message = await Message.findOne({ messageId });
          if (!message || String(message.recipientId) !== userId) {
            return;
          }

          if (!message.deliveredAt) {
            message.deliveredAt = new Date();
            await message.save();
          }

          io.to(`user:${String(message.senderId)}`).emit('message:delivered', {
            id: String(message._id),
            messageId: message.messageId,
            conversationId: String(message.conversationId),
            deliveredAt: message.deliveredAt.toISOString(),
          });
        } catch {
          // Ignore malformed delivery acks
        }
      }
    );

    socket.on(
      'message:read',
      async (
        payload: { messageId?: string },
        ack?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const messageId = String(payload?.messageId || '');
          if (!messageId) {
            ack?.({ ok: false, error: 'Missing messageId' });
            return;
          }

          const message = await Message.findOne({ messageId });
          if (!message) {
            ack?.({ ok: false, error: 'Message not found' });
            return;
          }

          if (String(message.recipientId) !== userId) {
            await logSecurityEvent({
              userId,
              action: 'UNAUTHORIZED_ACCESS',
              result: 'BLOCKED',
              detail: `Blocked unauthorized socket read receipt on ${messageId}`,
            });
            ack?.({ ok: false, error: 'Only recipient may mark read' });
            return;
          }

          const now = new Date();
          if (!message.deliveredAt) message.deliveredAt = now;
          if (!message.readAt) message.readAt = now;
          await message.save();

          const receipt = {
            id: String(message._id),
            messageId: message.messageId,
            conversationId: String(message.conversationId),
            deliveredAt: message.deliveredAt.toISOString(),
            readAt: message.readAt.toISOString(),
          };

          io.to(`user:${String(message.senderId)}`).emit('message:read', receipt);
          io.to(`conv:${String(message.conversationId)}`).emit('message:read', receipt);
          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false, error: 'Failed to update read receipt' });
        }
      }
    );

    socket.on('disconnect', async () => {
      const activeSet = onlineSockets.get(userId);
      if (activeSet) {
        activeSet.delete(socket.id);
        if (activeSet.size === 0) {
          onlineSockets.delete(userId);
          const lastSeen = new Date();
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeen,
          });
          io.emit('user:offline', {
            userId,
            username,
            isOnline: false,
            lastSeen: lastSeen.toISOString(),
          });
        }
      }
    });
  });

  ioInstance = io;
  return io;
}
