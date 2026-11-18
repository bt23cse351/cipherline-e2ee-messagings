import type {
  ConversationSummary,
  EncryptedMessageEnvelope,
  PublicUser,
  SecurityLogItem,
} from '../types/messaging';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error || `Request failed (${response.status})`, response.status);
  }

  return data as T;
}

export const api = {
  register(payload: {
    username: string;
    email: string;
    password: string;
    encryptionPublicKey?: string;
    signingPublicKey?: string;
    fingerprint?: string;
  }) {
    return request<{ token: string; expiresAt: string; user: PublicUser }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  login(payload: { identifier: string; password: string }) {
    return request<{ token: string; expiresAt: string; user: PublicUser }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  logout(token: string) {
    return request<{ message: string }>(
      '/api/auth/logout',
      { method: 'POST' },
      token
    );
  },

  getMe(token: string) {
    return request<{ user: PublicUser }>('/api/auth/me', {}, token);
  },

  searchUsers(token: string, search = '') {
    const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    return request<{ users: PublicUser[] }>(`/api/users${qs}`, {}, token);
  },

  getUserById(token: string, id: string) {
    return request<{ user: PublicUser }>(`/api/users/${id}`, {}, token);
  },

  publishKeys(
    token: string,
    payload: {
      encryptionPublicKey: string;
      signingPublicKey: string;
      fingerprint: string;
    }
  ) {
    return request<{
      userId: string;
      username: string;
      encryptionPublicKey: string;
      signingPublicKey: string;
      fingerprint: string;
      keyVersion: number;
    }>(
      '/api/keys/publish',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token
    );
  },

  getUserKeys(token: string, userId: string) {
    return request<{
      userId: string;
      username: string;
      encryptionPublicKey: string;
      signingPublicKey: string;
      fingerprint: string;
      keyVersion: number;
    }>(`/api/keys/${userId}`, {}, token);
  },

  createOrGetConversation(token: string, recipientId: string) {
    return request<{ conversation: ConversationSummary }>(
      '/api/conversations',
      {
        method: 'POST',
        body: JSON.stringify({ recipientId }),
      },
      token
    );
  },

  listConversations(token: string) {
    return request<{ conversations: ConversationSummary[] }>(
      '/api/conversations',
      {},
      token
    );
  },

  getMessages(token: string, conversationId: string) {
    return request<{ messages: EncryptedMessageEnvelope[] }>(
      `/api/messages/${conversationId}`,
      {},
      token
    );
  },

  sendMessageRest(token: string, envelope: EncryptedMessageEnvelope) {
    return request<{ message: EncryptedMessageEnvelope }>(
      '/api/messages',
      {
        method: 'POST',
        body: JSON.stringify(envelope),
      },
      token
    );
  },

  markMessageRead(token: string, idOrMessageId: string) {
    return request<{
      id: string;
      messageId: string;
      conversationId: string;
      deliveredAt: string;
      readAt: string;
    }>(
      `/api/messages/${idOrMessageId}/read`,
      { method: 'PATCH' },
      token
    );
  },

  getSecurityLogs(token: string) {
    return request<{ logs: SecurityLogItem[] }>('/api/security/logs', {}, token);
  },

  reportSignatureWarning(token: string, messageId: string) {
    return request<{ recorded: boolean }>(
      '/api/security/signature-warning',
      {
        method: 'POST',
        body: JSON.stringify({ messageId }),
      },
      token
    );
  },
};
