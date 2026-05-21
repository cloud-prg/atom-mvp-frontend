import type { Conversation, Message, SearchMode, SearchResult, User } from '../types/domain';

export interface StreamChatParams {
  conversationId?: string;
  content: string;
  clientMessageId: string;
  searchMode: SearchMode;
}

export interface StreamChatHandlers {
  onConversation: (conversation: Conversation) => void;
  onUserMessage: (message: Message) => void;
  onAssistantMessage: (message: Message) => void;
  onDelta: (message: Message) => void;
  onComplete: (message: Message) => void;
  onSearch: (results: SearchResult[]) => void;
}

export interface Quota {
  remainingMessages: number;
  grantedMessages: number;
  usedMessages: number;
}

export interface ApiClient {
  adminLogin(username: string, password: string): Promise<{ token: string; user: User }>;
  login(email: string, code: string): Promise<{ token: string; user: User }>;
  requestEmailVerification(email: string): Promise<{ expiresInSeconds: number }>;
  me(): Promise<User | null>;
  logout(): Promise<void>;
  getQuota(): Promise<Quota | null>;
  listConversations(): Promise<Conversation[]>;
  createConversation(title?: string): Promise<Conversation>;
  getMessages(conversationId: string): Promise<Message[]>;
  deleteConversation(conversationId: string): Promise<void>;
  streamChat(params: StreamChatParams, handlers: StreamChatHandlers): Promise<void>;
}
