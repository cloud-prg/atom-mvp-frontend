import type { AppState, Conversation, Message, SearchMode, SearchResult, User } from '../types/domain';
import { createId } from '../utils/id';
import { loadState, saveState } from './storage';

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function now(): string {
  return new Date().toISOString();
}

function persist(updater: (state: AppState) => AppState): AppState {
  const next = updater(loadState());
  saveState(next);
  return next;
}

function titleFrom(content: string): string {
  const normalized = content.trim().replace(/\s+/g, ' ');
  if (!normalized) return 'New chat';
  return normalized.length > 32 ? `${normalized.slice(0, 32)}...` : normalized;
}

function getMockSearchResults(query: string): SearchResult[] {
  return [
    {
      title: 'Refresh recovery pattern',
      url: 'https://example.com/refresh-recovery',
      snippet: `与「${query.slice(0, 18)}」相关的恢复策略：服务端保存消息，本地保存草稿，流式中断变成可继续状态。`,
      source: 'mock',
      publishedAt: '2026-05-21',
    },
    {
      title: 'SSE streaming for AI workbenches',
      url: 'https://example.com/sse-streaming',
      snippet: 'SSE 适合 MVP 阶段的单向 token 流，复杂度低于 WebSocket。',
      source: 'mock',
      publishedAt: '2026-05-21',
    },
  ];
}

export const mockApi = {
  async login(email: string, nickname: string): Promise<{ token: string; user: User }> {
    await delay(160);
    const user: User = {
      id: `user_${email.trim().toLowerCase()}`,
      email: email.trim().toLowerCase(),
      nickname: nickname.trim(),
      createdAt: now(),
    };
    const token = createId('token');
    persist((state) => ({ ...state, token, user }));
    return { token, user };
  },

  async me(): Promise<User | null> {
    await delay(60);
    return loadState().user;
  },

  async logout(): Promise<void> {
    persist((state) => ({ ...state, token: null, user: null }));
  },

  async listConversations(): Promise<Conversation[]> {
    await delay(80);
    return loadState().conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async createConversation(title = 'New chat'): Promise<Conversation> {
    await delay(80);
    const conversation: Conversation = {
      id: createId('conv'),
      title,
      createdAt: now(),
      updatedAt: now(),
    };
    persist((state) => ({
      ...state,
      conversations: [conversation, ...state.conversations],
      messages: { ...state.messages, [conversation.id]: [] },
    }));
    return conversation;
  },

  async getMessages(conversationId: string): Promise<Message[]> {
    await delay(80);
    return loadState().messages[conversationId] ?? [];
  },

  async deleteConversation(conversationId: string): Promise<void> {
    persist((state) => {
      const { [conversationId]: _removed, ...messages } = state.messages;
      return {
        ...state,
        conversations: state.conversations.filter((conversation) => conversation.id !== conversationId),
        messages,
      };
    });
  },

  async streamChat(
    params: {
      conversationId?: string;
      content: string;
      clientMessageId: string;
      searchMode: SearchMode;
    },
    handlers: {
      onConversation: (conversation: Conversation) => void;
      onUserMessage: (message: Message) => void;
      onAssistantMessage: (message: Message) => void;
      onDelta: (message: Message) => void;
      onComplete: (message: Message) => void;
      onSearch: (results: SearchResult[]) => void;
    },
  ): Promise<void> {
    let state = loadState();
    let conversation = params.conversationId
      ? state.conversations.find((item) => item.id === params.conversationId)
      : undefined;

    if (!conversation) {
      conversation = {
        id: createId('conv'),
        title: titleFrom(params.content),
        createdAt: now(),
        updatedAt: now(),
      };
      state = persist((current) => ({
        ...current,
        conversations: [conversation as Conversation, ...current.conversations],
        messages: { ...current.messages, [conversation!.id]: [] },
      }));
      handlers.onConversation(conversation);
    }

    const existing = state.messages[conversation.id]?.find((message) => message.clientMessageId === params.clientMessageId);
    if (existing) return;

    const userMessage: Message = {
      id: createId('msg'),
      conversationId: conversation.id,
      role: 'user',
      content: params.content,
      status: 'completed',
      clientMessageId: params.clientMessageId,
      createdAt: now(),
      updatedAt: now(),
    };
    const assistantMessage: Message = {
      id: createId('msg'),
      conversationId: conversation.id,
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: now(),
      updatedAt: now(),
      searchResults: [],
    };

    persist((current) => ({
      ...current,
      conversations: current.conversations.map((item) =>
        item.id === conversation!.id ? { ...item, title: item.title === 'New chat' ? titleFrom(params.content) : item.title, updatedAt: now() } : item,
      ),
      messages: {
        ...current.messages,
        [conversation!.id]: [...(current.messages[conversation!.id] ?? []), userMessage, assistantMessage],
      },
    }));
    handlers.onUserMessage(userMessage);
    handlers.onAssistantMessage(assistantMessage);

    const shouldSearch =
      params.searchMode === 'force' ||
      (params.searchMode === 'auto' && /最新|今天|新闻|价格|竞品|资料|调研|latest|today|news|price/i.test(params.content));
    const searchResults = shouldSearch ? getMockSearchResults(params.content) : [];
    if (searchResults.length > 0) {
      await delay(260);
      assistantMessage.searchResults = searchResults;
      handlers.onSearch(searchResults);
    }

    const answer =
      '这是 Demo Mode 的流式回答。当前 MVP 已支持登录、会话列表、消息持久化、搜索引用、刷新恢复和失败重试的前端闭环。刷新页面后，当前会话会从本地持久化层恢复，输入草稿也会保留。';

    for (const char of answer) {
      await delay(12);
      assistantMessage.content += char;
      assistantMessage.updatedAt = now();
      persist((current) => ({
        ...current,
        messages: {
          ...current.messages,
          [conversation!.id]: (current.messages[conversation!.id] ?? []).map((message) =>
            message.id === assistantMessage.id ? { ...assistantMessage } : message,
          ),
        },
      }));
      handlers.onDelta({ ...assistantMessage });
    }

    assistantMessage.status = 'completed';
    assistantMessage.updatedAt = now();
    persist((current) => ({
      ...current,
      messages: {
        ...current.messages,
        [conversation!.id]: (current.messages[conversation!.id] ?? []).map((message) =>
          message.id === assistantMessage.id ? { ...assistantMessage } : message,
        ),
      },
    }));
    handlers.onComplete({ ...assistantMessage });
  },
};

