import type { AppState, Conversation, Message } from '../types/domain';

const STATE_KEY = 'atom-mvp-state';

const emptyState: AppState = {
  token: null,
  user: null,
  conversations: [],
  messages: {},
};

export function loadState(): AppState {
  const raw = localStorage.getItem(STATE_KEY);
  if (!raw) return emptyState;
  try {
    return { ...emptyState, ...JSON.parse(raw) } as AppState;
  } catch {
    return emptyState;
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export function archiveConversationSnapshot(conversation: Conversation, messages: Message[] = []): void {
  const archivedAt = conversation.archivedAt ?? new Date().toISOString();
  const archivedConversation = { ...conversation, archivedAt, updatedAt: archivedAt };
  const state = loadState();
  saveState({
    ...state,
    conversations: [
      archivedConversation,
      ...state.conversations.filter((item) => item.id !== conversation.id),
    ],
    messages: {
      ...state.messages,
      [conversation.id]: messages,
    },
  });
}

export function resetState(): void {
  localStorage.removeItem(STATE_KEY);
}

export function getDraftKey(userId: string, conversationId: string): string {
  return `atom-mvp-draft:${userId}:${conversationId}`;
}

export function loadDraft(userId: string, conversationId: string): string {
  return localStorage.getItem(getDraftKey(userId, conversationId)) ?? '';
}

export function saveDraft(userId: string, conversationId: string, value: string): void {
  localStorage.setItem(getDraftKey(userId, conversationId), value);
}

export function clearDraft(userId: string, conversationId: string): void {
  localStorage.removeItem(getDraftKey(userId, conversationId));
}
