import type { Conversation, Message, MessageQuota, MessageRole, MessageStatus, SearchMode, SearchResult, User } from '../types/domain';
import type { ApiClient, StreamChatHandlers } from './types';

interface RealApiOptions {
  baseUrl: string;
  getToken?: () => string | null;
  setToken?: (token: string | null) => void;
}

interface UserOut {
  id: string;
  email: string;
  nickname: string;
  created_at: string;
}

interface ConversationOut {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MessageOut {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  status: string;
  client_message_id: string | null;
  created_at: string;
  updated_at: string;
  search_results?: SearchResultOut[];
}

interface SearchResultOut {
  title: string;
  url: string;
  snippet: string;
  source: string;
  published_at?: string | null;
}

interface QuotaOut {
  remaining_messages: number;
  granted_messages: number;
  used_messages: number;
}

interface ChatStreamEvent {
  type?: string;
  event?: string;
  conversation?: ConversationOut;
  user_message?: MessageOut;
  assistant_message?: MessageOut;
  message?: MessageOut;
  delta?: string;
  content?: string;
  results?: SearchResultOut[];
}

export const apiTokenStorageKey = 'atom-mvp-api-token';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function mapUser(user: UserOut): User {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    createdAt: user.created_at,
  };
}

function mapConversation(conversation: ConversationOut): Conversation {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at,
  };
}

function isMessageRole(value: string): value is MessageRole {
  return ['user', 'assistant', 'system', 'tool'].includes(value);
}

function isMessageStatus(value: string): value is MessageStatus {
  return ['pending', 'streaming', 'interrupted', 'completed', 'failed'].includes(value);
}

function mapSearchResult(result: SearchResultOut): SearchResult {
  return {
    title: result.title,
    url: result.url,
    snippet: result.snippet,
    source: result.source,
    publishedAt: result.published_at ?? undefined,
  };
}

function mapMessage(message: MessageOut): Message {
  return {
    id: message.id,
    conversationId: message.conversation_id,
    role: isMessageRole(message.role) ? message.role : 'assistant',
    content: message.content,
    status: isMessageStatus(message.status) ? message.status : 'completed',
    clientMessageId: message.client_message_id ?? undefined,
    createdAt: message.created_at,
    updatedAt: message.updated_at,
    searchResults: message.search_results?.map(mapSearchResult),
  };
}

function mapQuota(quota: QuotaOut): MessageQuota {
  return {
    remainingMessages: quota.remaining_messages,
    grantedMessages: quota.granted_messages,
    usedMessages: quota.used_messages,
  };
}

export function readApiToken(): string | null {
  return localStorage.getItem(apiTokenStorageKey);
}

export function writeApiToken(token: string | null): void {
  if (token) {
    localStorage.setItem(apiTokenStorageKey, token);
  } else {
    localStorage.removeItem(apiTokenStorageKey);
  }
}

export function createRealApi({ baseUrl, getToken = readApiToken, setToken = writeApiToken }: RealApiOptions): ApiClient {
  const root = normalizeBaseUrl(baseUrl);

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = getToken();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${root}${path}`, { ...init, headers });
    if (!response.ok) {
      const text = await response.text();
      throw new ApiRequestError(text || `Request failed with status ${response.status}`, response.status);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  async function readJsonOrStream(response: Response, handlers: StreamChatHandlers): Promise<void> {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/event-stream') && response.body) {
      await readSse(response.body, handlers);
      return;
    }

    const payload = (await response.json()) as ChatStreamEvent | MessageOut | MessageOut[];
    if (Array.isArray(payload)) {
      payload.map(mapMessage).forEach((message) => {
        if (message.role === 'user') handlers.onUserMessage(message);
        if (message.role === 'assistant') handlers.onAssistantMessage(message);
      });
      const latestAssistant = payload.map(mapMessage).reverse().find((message) => message.role === 'assistant');
      if (latestAssistant) handlers.onComplete(latestAssistant);
      return;
    }
    handleStreamEvent(payload as ChatStreamEvent, handlers);
  }

  async function readSse(body: ReadableStream<Uint8Array>, handlers: StreamChatHandlers): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\n\n/);
      buffer = events.pop() ?? '';
      for (const event of events) {
        const data = event
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n');
        if (!data || data === '[DONE]') continue;
        handleStreamEvent(JSON.parse(data) as ChatStreamEvent, handlers);
      }
    }
  }

  function handleStreamEvent(event: ChatStreamEvent | MessageOut, handlers: StreamChatHandlers): void {
    if ('conversation_id' in event) {
      const message = mapMessage(event);
      handlers.onAssistantMessage(message);
      if (message.status === 'completed') handlers.onComplete(message);
      return;
    }

    if (event.conversation) handlers.onConversation(mapConversation(event.conversation));
    if (event.user_message) handlers.onUserMessage(mapMessage(event.user_message));
    if (event.assistant_message) handlers.onAssistantMessage(mapMessage(event.assistant_message));
    if (event.results) handlers.onSearch(event.results.map(mapSearchResult));
    if (event.message) {
      const message = mapMessage(event.message);
      const type = event.type ?? event.event;
      if (type === 'complete' || message.status === 'completed') {
        handlers.onComplete(message);
      } else {
        handlers.onDelta(message);
      }
    }
  }

  return {
    async adminLogin(username, password) {
      const result = await request<{ token: string; user: UserOut }>('/api/auth/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setToken(result.token);
      return { token: result.token, user: mapUser(result.user) };
    },

    async login(email, code) {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await request<{ token: string; user: UserOut }>('/api/auth/email/verify', {
        method: 'POST',
        body: JSON.stringify({
          email: normalizedEmail,
          code,
        }),
      });
      setToken(result.token);
      return { token: result.token, user: mapUser(result.user) };
    },

    async requestEmailVerification(email) {
      const result = await request<{ ok: boolean; expires_in_seconds: number }>('/api/auth/email/code', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      return {
        expiresInSeconds: result.expires_in_seconds,
      };
    },

    async me() {
      const user = await request<UserOut>('/api/auth/me');
      return mapUser(user);
    },

    async logout() {
      await request('/api/auth/logout', { method: 'POST' });
      setToken(null);
    },

    async getQuota() {
      const quota = await request<QuotaOut>('/api/quotas/me');
      return mapQuota(quota);
    },

    async listConversations() {
      const conversations = await request<ConversationOut[]>('/api/conversations');
      return conversations.map(mapConversation);
    },

    async createConversation(title = 'New chat') {
      const conversation = await request<ConversationOut>('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      return mapConversation(conversation);
    },

    async getMessages(conversationId) {
      const messages = await request<MessageOut[]>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`);
      return messages.map(mapMessage);
    },

    async deleteConversation(conversationId) {
      await request(`/api/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' });
    },

    async streamChat(params, handlers) {
      const token = getToken();
      const headers = new Headers({
        Accept: 'text/event-stream, application/json',
        'Content-Type': 'application/json',
      });
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      const response = await fetch(`${root}/api/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          conversation_id: params.conversationId,
          content: params.content,
          client_message_id: params.clientMessageId,
          search_mode: params.searchMode,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new ApiRequestError(text || `Request failed with status ${response.status}`, response.status);
      }
      await readJsonOrStream(response, handlers);
    },
  };
}
