import { describe, expect, it, vi } from 'vitest';
import { selectApiClient } from './client';
import { mockApi } from './mockApi';
import { createRealApi } from './realApi';

describe('selectApiClient', () => {
  it('uses mock API when demo mode is enabled', () => {
    expect(selectApiClient({ apiBaseUrl: 'http://localhost:8000', demoMode: true })).toBe(mockApi);
  });

  it('uses mock API when no API base URL is configured', () => {
    expect(selectApiClient({ demoMode: false })).toBe(mockApi);
  });

  it('uses real API when demo mode is disabled and API base URL exists', () => {
    expect(selectApiClient({ apiBaseUrl: 'http://localhost:8000', demoMode: false })).not.toBe(mockApi);
  });

  it('routes persisted stream messages by role when the API returns message objects', async () => {
    const userMessage = {
      id: 'message-user',
      conversation_id: 'conversation-1',
      role: 'user',
      content: '排查测试',
      status: 'completed',
      client_message_id: 'client-1',
      created_at: '2026-05-21T00:00:00.000Z',
      updated_at: '2026-05-21T00:00:00.000Z',
    };
    const assistantMessage = {
      id: 'message-assistant',
      conversation_id: 'conversation-1',
      role: 'assistant',
      content: '收到',
      status: 'completed',
      client_message_id: null,
      created_at: '2026-05-21T00:00:01.000Z',
      updated_at: '2026-05-21T00:00:01.000Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([userMessage, assistantMessage]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const handlers = {
      onConversation: vi.fn(),
      onUserMessage: vi.fn(),
      onAssistantMessage: vi.fn(),
      onDelta: vi.fn(),
      onComplete: vi.fn(),
      onSearch: vi.fn(),
    };

    await createRealApi({ baseUrl: 'http://localhost:8000', getToken: () => 'token' }).streamChat(
      {
        conversationId: 'conversation-1',
        content: '排查测试',
        clientMessageId: 'client-1',
        searchMode: 'auto',
      },
      handlers,
    );

    expect(handlers.onUserMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'message-user', role: 'user' }));
    expect(handlers.onAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'message-assistant', role: 'assistant' }));
    expect(handlers.onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: 'message-assistant', status: 'completed' }));
  });
});
