import { io, type Socket } from 'socket.io-client';

export function createChatSocket(token: string): Socket {
  return io(window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 12,
    reconnectionDelay: 1000,
  });
}
