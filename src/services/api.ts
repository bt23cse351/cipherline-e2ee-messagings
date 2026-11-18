import type {
  ConversationSummary,
  EncryptedMessageEnvelope,
  PublicKeyBundle,
  SecurityLogEntry,
  UserProfile,
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
  options: {
    method?: string;
    token?: string | null;
    body?: unknown;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const res = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    throw new ApiError(
      (data && typeof data.error === 'string' && data.error) ||
        `Request failed with status ${res.status}`,
      res.status
    );
  }

  return data as T;
}

export interface AuthResponse {
  token: string;
  expiresAt: string;
  user: UserProfile;
}

export const api = {
  register(payload: {
    username: string;
    email: string;
    password: string;
    encryptionPublicKey?: string;
    signingPublicKey?: string;
    fingerprint?: string;
  }): Promise<AuthResponse> {
    return request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: payload,
    });
  },

  login(payload: { identifier: string; password: string }): Promise<AuthResponse> {
    return request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: payload,
    });
  },

  logout(token: string): Promise<{ message: string }> {
    return request<{ message: string }>('/api/auth/logout', {
      method: 'POST',
      token,
    });
  },

  getMe(token: string): Promise<{ user: UserProfile }> {
    return request<{ user: UserProfile }>('/api/auth/me', { token });
  },

  listUsers(token: string, search = ''): Promise<{ users: UserProfile[] }> {
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    return request<{ users: UserProfile[] }>(`/api/users${query}`, { token });
  },

  getUserById(token: string, userId: string): Promise<{ user: UserProfile }> {
    return request<{ user: UserProfile }>(`/api/users/${encodeURIComponent(userId)}`, { token });
  },

  publishKeys(
    token: string,
    payload: {
      encryptionPublicKey: string;
      signingPublicKey: string;
      fingerprint: string;
    }
  ): Promise<PublicKeyBundle> {
    return request<PublicKeyBundle>('/api/keys/publish', {
      method: 'POST',
      token,
      body: payload,
    });
  },

  getUserKeys(token: string, userId: string): Promise<PublicKeyBundle> {
    return request<PublicKeyBundle>(`/api/keys/${encodeURIComponent(userId)}`, { token });
  },

  listConversations(token: string): Promise<{ conversations: ConversationSummary[] }> {
    return request<{ conversations: ConversationSummary[] }>('/api/conversations', { token });
  },

  createOrGetConversation(
    token: string,
    recipientId: string
  ): Promise<{ conversation: ConversationSummary }> {
    return request<{ conversation: ConversationSummary }>('/api/conversations', {
      method: 'POST',
      token,
      body: { recipientId },
    });
  },

  getMessages(
    token: string,
    conversationId: string
  ): Promise<{ messages: EncryptedMessageEnvelope[] }> {
    return request<{ messages: EncryptedMessageEnvelope[] }>(
      `/api/messages/${encodeURIComponent(conversationId)}`,
      { token }
    );
  },

  sendMessage(
    token: string,
    envelope: EncryptedMessageEnvelope
  ): Promise<{ message: EncryptedMessageEnvelope }> {
    return request<{ message: EncryptedMessageEnvelope }>('/api/messages', {
      method: 'POST',
      token,
      body: envelope,
    });
  },

  markMessageRead(
    token: string,
    id: string
  ): Promise<{
    id: string;
    messageId: string;
    conversationId: string;
    deliveredAt: string;
    readAt: string;
  }> {
    return request(`/api/messages/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
      token,
    });
  },

  getSecurityLogs(token: string): Promise<{ logs: SecurityLogEntry[] }> {
    return request<{ logs: SecurityLogEntry[] }>('/api/security/logs', { token });
  },

  reportSignatureWarning(token: string, messageId: string): Promise<{ recorded: boolean }> {
    return request<{ recorded: boolean }>('/api/security/signature-warning', {
      method: 'POST',
      token,
      body: { messageId },
    });
  },
};
