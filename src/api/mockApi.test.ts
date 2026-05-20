import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mockApi } from './mockApi';
import { resetState } from './storage';

describe('mockApi', () => {
  beforeEach(() => {
    resetState();
    vi.useRealTimers();
  });

  it('creates a conversation and completed assistant message through streaming', async () => {
    await mockApi.login('demo@example.com', 'Demo');
    const stream = mockApi.streamChat(
      {
        content: '今天怎么做刷新恢复？',
        clientMessageId: 'client-1',
        searchMode: 'auto',
      },
      {
        onConversation: vi.fn(),
        onUserMessage: vi.fn(),
        onAssistantMessage: vi.fn(),
        onDelta: vi.fn(),
        onComplete: vi.fn(),
        onSearch: vi.fn(),
      },
    );

    await stream;

    const conversations = await mockApi.listConversations();
    expect(conversations).toHaveLength(1);
    const messages = await mockApi.getMessages(conversations[0].id);
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(messages[1].status).toBe('completed');
    expect(messages[1].searchResults?.length).toBeGreaterThan(0);
  });
});
