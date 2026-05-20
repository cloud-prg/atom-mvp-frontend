export type SearchMode = 'off' | 'auto' | 'force';
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type MessageStatus = 'pending' | 'streaming' | 'interrupted' | 'completed' | 'failed';

export interface User {
  id: string;
  email: string;
  nickname: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  clientMessageId?: string;
  createdAt: string;
  updatedAt: string;
  searchResults?: SearchResult[];
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt?: string;
}

export interface AppState {
  token: string | null;
  user: User | null;
  conversations: Conversation[];
  messages: Record<string, Message[]>;
}

