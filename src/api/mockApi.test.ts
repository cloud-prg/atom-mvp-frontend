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

  it('renames a conversation in local demo mode', async () => {
    const conversation = await mockApi.createConversation('Planning');

    await mockApi.updateConversationTitle(conversation.id, '  Product sync  ');

    const conversations = await mockApi.listConversations();
    expect(conversations[0]).toEqual(
      expect.objectContaining({
        id: conversation.id,
        title: 'Product sync',
      }),
    );
  });

  it('keeps archived conversations and their messages available', async () => {
    const conversation = await mockApi.createConversation('Archived plan');

    await mockApi.deleteConversation(conversation.id);

    expect(await mockApi.listConversations()).toHaveLength(0);
    const archived = await mockApi.listArchivedConversations();
    expect(archived[0]).toEqual(expect.objectContaining({ id: conversation.id, archivedAt: expect.any(String) }));
    await expect(mockApi.getMessages(conversation.id)).resolves.toEqual([]);
  });
});
