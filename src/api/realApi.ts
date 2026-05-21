import type { Conversation, Message, MessageQuota, MessageRole, MessageStatus, SearchMode, SearchResult, User } from '../types/domain';
import { loadState } from './storage';
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
  archived_at?: string | null;
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
  user_message?: Partial<MessageOut>;
  assistant_message?: Partial<MessageOut>;
  message?: MessageOut;
  id?: string;
  delta?: string;
  content?: string;
  results?: SearchResultOut[];
}

interface StreamContext {
  conversationId?: string;
  userContent: string;
  clientMessageId: string;
  assistantMessageId?: string;
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
    archivedAt: conversation.archived_at ?? undefined,
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

function mapPartialMessage(
  message: Partial<MessageOut>,
  fallback: {
    conversationId?: string;
    role: MessageRole;
    content?: string;
    status?: MessageStatus;
    clientMessageId?: string | null;
  },
): Message {
  const now = new Date().toISOString();
  return {
    id: message.id ?? `${fallback.role}-${fallback.clientMessageId ?? now}`,
    conversationId: message.conversation_id ?? fallback.conversationId ?? '',
    role: isMessageRole(message.role ?? '') ? (message.role as MessageRole) : fallback.role,
    content: message.content ?? fallback.content ?? '',
    status: isMessageStatus(message.status ?? '') ? message.status as MessageStatus : fallback.status ?? 'completed',
    clientMessageId: message.client_message_id ?? fallback.clientMessageId ?? undefined,
    createdAt: message.created_at ?? now,
    updatedAt: message.updated_at ?? now,
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

function listLocalArchivedConversations(): Conversation[] {
  return loadState().conversations
    .filter((conversation) => conversation.archivedAt)
    .sort((a, b) => (b.archivedAt ?? b.updatedAt).localeCompare(a.archivedAt ?? a.updatedAt));
}

function mergeArchivedConversations(remote: Conversation[], local: Conversation[]): Conversation[] {
  return [...remote, ...local.filter((conversation) => !remote.some((item) => item.id === conversation.id))]
    .sort((a, b) => (b.archivedAt ?? b.updatedAt).localeCompare(a.archivedAt ?? a.updatedAt));
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

  function buildStreamChatBody(params: Parameters<ApiClient['streamChat']>[0]): { body: BodyInit; contentType?: string } {
    if (params.attachments?.length) {
      const formData = new FormData();
      if (params.conversationId) {
        formData.set('conversation_id', params.conversationId);
      }
      formData.set('content', params.content);
      formData.set('client_message_id', params.clientMessageId);
      formData.set('search_mode', params.searchMode);
      if (params.replaceAfterMessageId) {
        formData.set('replace_after_message_id', params.replaceAfterMessageId);
      }
      params.attachments.forEach((attachment) => {
        formData.append('attachments', attachment);
      });
      return { body: formData };
    }

    return {
      body: JSON.stringify({
        conversation_id: params.conversationId,
        content: params.content,
        client_message_id: params.clientMessageId,
        search_mode: params.searchMode,
        replace_after_message_id: params.replaceAfterMessageId,
      }),
      contentType: 'application/json',
    };
  }

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

  async function readJsonOrStream(response: Response, handlers: StreamChatHandlers, context?: StreamContext): Promise<void> {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/event-stream') && response.body) {
      await readSse(response.body, handlers, context);
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
    handleStreamEvent(payload as ChatStreamEvent, handlers, context);
  }

  async function readSse(body: ReadableStream<Uint8Array>, handlers: StreamChatHandlers, context?: StreamContext): Promise<void> {
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
        const lines = event.split('\n');
        const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
        const data = lines
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n');
        if (!data || data === '[DONE]') continue;
        handleStreamEvent({ ...(JSON.parse(data) as ChatStreamEvent), event: eventName }, handlers, context);
      }
    }
  }

  function handleStreamEvent(event: ChatStreamEvent | MessageOut, handlers: StreamChatHandlers, context?: StreamContext): void {
    if ('conversation_id' in event) {
      const message = mapMessage(event);
      if (message.role === 'user') {
        handlers.onUserMessage(message);
      } else if (message.status === 'completed') {
        handlers.onComplete(message);
      } else {
        handlers.onAssistantMessage(message);
      }
      return;
    }

    if (event.conversation) {
      if (context) context.conversationId = event.conversation.id;
      handlers.onConversation(mapConversation(event.conversation));
    }
    if (event.user_message) {
      handlers.onUserMessage(
        mapPartialMessage(event.user_message, {
          conversationId: context?.conversationId,
          role: 'user',
          content: context?.userContent,
          status: 'completed',
          clientMessageId: context?.clientMessageId,
        }),
      );
    }
    if (event.assistant_message) {
      const assistant = mapPartialMessage(event.assistant_message, {
        conversationId: context?.conversationId,
        role: 'assistant',
        status: 'streaming',
      });
      if (context) context.assistantMessageId = assistant.id;
      handlers.onAssistantMessage(assistant);
    }
    if (event.results) handlers.onSearch(event.results.map(mapSearchResult));
    if (event.delta || event.content) {
      const type = event.type ?? event.event;
      const message = mapPartialMessage(
        {
          id: event.id ?? context?.assistantMessageId,
          content: event.content ?? event.delta ?? '',
          status: type === 'message.completed' ? 'completed' : 'streaming',
        },
        {
          conversationId: context?.conversationId,
          role: 'assistant',
          status: type === 'message.completed' ? 'completed' : 'streaming',
        },
      );
      if (type === 'message.completed') {
        handlers.onComplete(message);
      } else {
        handlers.onDelta(message);
      }
    }
    if (event.message) {
      const message = mapMessage(event.message);
      const type = event.type ?? event.event;
      if (type === 'complete' || type === 'message.completed' || message.status === 'completed') {
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
      return conversations.map(mapConversation).filter((conversation) => !conversation.archivedAt);
    },

    async listArchivedConversations() {
      try {
        const conversations = await request<ConversationOut[]>('/api/conversations?archived=true');
        return mergeArchivedConversations(
          conversations.map(mapConversation).filter((conversation) => conversation.archivedAt),
          listLocalArchivedConversations(),
        );
      } catch (error) {
        if (error instanceof ApiRequestError && (error.status === 404 || error.status === 422)) {
          return listLocalArchivedConversations();
        }
        throw error;
      }
    },

    async createConversation(title = 'New chat') {
      const conversation = await request<ConversationOut>('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      return mapConversation(conversation);
    },

    async updateConversationTitle(conversationId, title) {
      const conversation = await request<ConversationOut>(`/api/conversations/${encodeURIComponent(conversationId)}`, {
        method: 'PATCH',
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
      });
      const { body, contentType } = buildStreamChatBody(params);
      if (contentType) {
        headers.set('Content-Type', contentType);
      }
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      const response = await fetch(`${root}/api/chat/stream`, {
        method: 'POST',
        headers,
        body,
        signal: params.signal,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new ApiRequestError(text || `Request failed with status ${response.status}`, response.status);
      }
      await readJsonOrStream(response, handlers, {
        conversationId: params.conversationId,
        userContent: params.content,
        clientMessageId: params.clientMessageId,
      });
    },
  };
}
