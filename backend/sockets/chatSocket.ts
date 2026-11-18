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

interface SocketUser {
  id: string;
  username: string;
}

type AckFn = (response: Record<string, unknown>) => void;

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.nodeEnv === 'production' && env.hasExplicitCors ? env.corsOrigins : true,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket, next) => {
    try {
      const dbReady = await waitForDatabase(15000);
      if (!dbReady) {
        return next(new Error('Database initializing'));
      }

      const authToken =
        typeof socket.handshake.auth?.token === 'string'
          ? socket.handshake.auth.token
          : typeof socket.handshake.headers.authorization === 'string'
          ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
          : '';

      if (!authToken) {
        return next(new Error('Authentication required'));
      }

      const payload = await verifyAuthToken(authToken);
      (socket.data as { user: SocketUser }).user = {
        id: payload.sub,
        username: payload.username,
      };
      next();
    } catch {
      next(new Error('Invalid or expired session token'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const user = (socket.data as { user?: SocketUser }).user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    const userId = user.id;
    let userSockets = onlineSockets.get(userId);
    const wasOffline = !userSockets || userSockets.size === 0;
    if (!userSockets) {
      userSockets = new Set<string>();
      onlineSockets.set(userId, userSockets);
    }
    userSockets.add(socket.id);

    await socket.join(`user:${userId}`);

    const now = new Date();
    await User.findByIdAndUpdate(userId, {
      isOnline: true,
      lastSeen: now,
    }).catch(() => {});

    if (wasOffline) {
      io.emit('user:online', {
        userId,
        username: user.username,
        lastSeen: now.toISOString(),
      });
    }

    socket.on('conversation:join', async (conversationId: unknown, ack?: AckFn) => {
      try {
        if (typeof conversationId !== 'string' || !isValidObjectId(conversationId)) {
          ack?.({ ok: false, error: 'Invalid conversation ID' });
          return;
        }
        const conversation = await Conversation.findById(conversationId).lean();
        if (!conversation) {
          ack?.({ ok: false, error: 'Conversation not found' });
          return;
        }
        const isMember = conversation.participants.some((p) => String(p) === userId);
        if (!isMember) {
          await logSecurityEvent({
            userId,
            action: 'UNAUTHORIZED_ACCESS',
            result: 'BLOCKED',
            detail: `Blocked socket room join for conversation ${conversationId}`,
          });
          ack?.({ ok: false, error: 'Forbidden' });
          return;
        }
        await socket.join(`conv:${conversationId}`);
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false, error: 'Failed to join conversation' });
      }
    });

    socket.on('conversation:leave', async (conversationId: unknown) => {
      if (typeof conversationId === 'string' && isValidObjectId(conversationId)) {
        await socket.leave(`conv:${conversationId}`);
      }
    });

    socket.on('message:send', async (payload: unknown, ack?: AckFn) => {
      try {
        if (!payload || typeof payload !== 'object') {
          ack?.({ ok: false, error: 'Invalid payload' });
          return;
        }
        const raw = payload as Record<string, unknown>;
        if ('plaintext' in raw || 'text' in raw) {
          ack?.({ ok: false, error: 'Plaintext messages are prohibited' });
          return;
        }

        const parsed = sendMessageSchema.safeParse(raw);
        if (!parsed.success) {
          ack?.({
            ok: false,
            error: parsed.error.issues[0]?.message || 'Invalid encrypted message envelope',
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
            detail: `Blocked unauthorized socket send to ${data.conversationId}`,
          });
          ack?.({ ok: false, error: 'Not a participant in this conversation' });
          return;
        }

        const expectedRecipient = participantIds.find((id) => id !== userId);
        if (!expectedRecipient || expectedRecipient !== data.recipientId) {
          ack?.({ ok: false, error: 'Recipient mismatch' });
          return;
        }

        const duplicate = await Message.exists({ messageId: data.messageId });
        if (duplicate) {
          ack?.({ ok: false, error: 'Duplicate messageId rejected' });
          return;
        }

        const recipientOnline = isUserOnline(data.recipientId);
        const sentAt = new Date();

        const messageDoc = await Message.create({
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
          deliveredAt: recipientOnline ? sentAt : null,
          readAt: null,
        });

        conversation.lastMessageAt = sentAt;
        await conversation.save();

        await logSecurityEvent({
          userId,
          action: 'MESSAGE_SENT',
          result: 'SUCCESS',
          detail: `Socket ciphertext delivered (${data.messageId.slice(0, 8)})`,
        });

        const serialized = serializeMessage(messageDoc);
        io.to(`user:${data.recipientId}`).emit('message:new', serialized);
        io.to(`conv:${data.conversationId}`).emit('message:new', serialized);

        if (recipientOnline) {
          io.to(`user:${userId}`).emit('message:delivered', {
            id: serialized.id,
            messageId: serialized.messageId,
            conversationId: serialized.conversationId,
            deliveredAt: sentAt.toISOString(),
          });
        }

        ack?.({ ok: true, message: serialized });
      } catch {
        ack?.({ ok: false, error: 'Failed to persist encrypted message' });
      }
    });

    socket.on('message:delivered', async (payload: unknown) => {
      try {
        if (!payload || typeof payload !== 'object') return;
        const { messageId, id } = payload as { messageId?: unknown; id?: unknown };
        const lookup =
          typeof id === 'string' && isValidObjectId(id)
            ? { _id: id }
            : typeof messageId === 'string'
            ? { messageId }
            : null;
        if (!lookup) return;

        const message = await Message.findOne(lookup);
        if (!message || String(message.recipientId) !== userId) return;

        if (!message.deliveredAt) {
          message.deliveredAt = new Date();
          await message.save();
        }

        const eventPayload = {
          id: String(message._id),
          messageId: message.messageId,
          conversationId: String(message.conversationId),
          deliveredAt: message.deliveredAt.toISOString(),
        };

        io.to(`user:${String(message.senderId)}`).emit('message:delivered', eventPayload);
        io.to(`conv:${String(message.conversationId)}`).emit('message:delivered', eventPayload);
      } catch {
        // Ignore transient delivery ack errors
      }
    });

    socket.on('message:read', async (payload: unknown, ack?: AckFn) => {
      try {
        if (!payload || typeof payload !== 'object') {
          ack?.({ ok: false, error: 'Invalid payload' });
          return;
        }
        const { messageId, id } = payload as { messageId?: unknown; id?: unknown };
        const lookup =
          typeof id === 'string' && isValidObjectId(id)
            ? { _id: id }
            : typeof messageId === 'string'
            ? { messageId }
            : null;
        if (!lookup) {
          ack?.({ ok: false, error: 'Message identifier required' });
          return;
        }

        const message = await Message.findOne(lookup);
        if (!message || String(message.recipientId) !== userId) {
          ack?.({ ok: false, error: 'Forbidden' });
          return;
        }

        const readTimestamp = new Date();
        if (!message.deliveredAt) {
          message.deliveredAt = readTimestamp;
        }
        if (!message.readAt) {
          message.readAt = readTimestamp;
        }
        await message.save();

        const eventPayload = {
          id: String(message._id),
          messageId: message.messageId,
          conversationId: String(message.conversationId),
          deliveredAt: message.deliveredAt.toISOString(),
          readAt: message.readAt.toISOString(),
        };

        io.to(`user:${String(message.senderId)}`).emit('message:read', eventPayload);
        io.to(`conv:${String(message.conversationId)}`).emit('message:read', eventPayload);
        ack?.({ ok: true, ...eventPayload });
      } catch {
        ack?.({ ok: false, error: 'Failed to update read receipt' });
      }
    });

    socket.on('disconnect', async () => {
      const sockets = onlineSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineSockets.delete(userId);
          const offlineAt = new Date();
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeen: offlineAt,
          }).catch(() => {});
          io.emit('user:offline', {
            userId,
            lastSeen: offlineAt.toISOString(),
          });
        }
      }
    });
  });

  ioInstance = io;
  return io;
}
