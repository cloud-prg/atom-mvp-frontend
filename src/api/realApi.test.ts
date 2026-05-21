import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRealApi } from './realApi';
import type { StreamChatHandlers } from './types';

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

describe('createRealApi streamChat', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('updates a conversation title through the backend patch endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'conversation-1',
          title: 'Product sync',
          created_at: '2026-05-21T00:00:00.000Z',
          updated_at: '2026-05-21T00:01:00.000Z',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const conversation = await createRealApi({ baseUrl: 'http://localhost:8000', getToken: () => 'token' }).updateConversationTitle(
      'conversation-1',
      'Product sync',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/conversations/conversation-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ title: 'Product sync' }),
      }),
    );
    expect(conversation).toEqual(
      expect.objectContaining({
        id: 'conversation-1',
        title: 'Product sync',
      }),
    );
  });

  it('keeps the production host unchanged and uses the public atomApi prefix', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'conversation-1',
          title: 'Production host check',
          created_at: '2026-05-21T00:00:00.000Z',
          updated_at: '2026-05-21T00:01:00.000Z',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createRealApi({ baseUrl: 'http://atom.jiujiuwarehouse.com', getToken: () => 'token' }).updateConversationTitle(
      'conversation-1',
      'Production host check',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://atom.jiujiuwarehouse.com/atomApi/conversations/conversation-1',
      expect.any(Object),
    );
  });

  it('maps lightweight SSE stream events into frontend messages', async () => {
    const body = [
      sse('message.created', {
        conversation: { id: 'conversation-1', title: 'New chat' },
        user_message: { id: 'user-message-1', content: 'hello' },
        assistant_message: { id: 'assistant-message-1', status: 'streaming' },
      }),
      sse('message.delta', {
        id: 'assistant-message-1',
        delta: '收到',
        content: '收到',
      }),
      sse('message.completed', {
        id: 'assistant-message-1',
        content: '收到',
      }),
    ].join('');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    );
    const handlers: StreamChatHandlers = {
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
        content: 'hello',
        clientMessageId: 'client-1',
        searchMode: 'off',
      },
      handlers,
    );

    expect(handlers.onUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-message-1',
        conversationId: 'conversation-1',
        role: 'user',
        content: 'hello',
      }),
    );
    expect(handlers.onAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'assistant-message-1',
        conversationId: 'conversation-1',
        role: 'assistant',
        status: 'streaming',
      }),
    );
    expect(handlers.onDelta).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'assistant-message-1',
        content: '收到',
        status: 'streaming',
      }),
    );
    expect(handlers.onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'assistant-message-1',
        content: '收到',
        status: 'completed',
      }),
    );
  });

  it('sends stream requests with attachments as multipart form data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'message-assistant',
          conversation_id: 'conversation-1',
          role: 'assistant',
          content: '收到附件',
          status: 'completed',
          client_message_id: null,
          created_at: '2026-05-21T00:00:00.000Z',
          updated_at: '2026-05-21T00:00:00.000Z',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['hello'], 'brief.pdf', { type: 'application/pdf' });
    const handlers: StreamChatHandlers = {
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
        content: '总结附件',
        clientMessageId: 'client-1',
        searchMode: 'auto',
        attachments: [file],
      },
      handlers,
    );

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.get('Content-Type')).toBeNull();
    expect(init.body).toBeInstanceOf(FormData);
    const body = init.body as FormData;
    expect(body.get('conversation_id')).toBe('conversation-1');
    expect(body.get('content')).toBe('总结附件');
    expect(body.get('client_message_id')).toBe('client-1');
    expect(body.get('search_mode')).toBe('auto');
    expect(body.getAll('attachments')).toEqual([file]);
  });

  it('passes abort signals to the stream request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'message-assistant',
          conversation_id: 'conversation-1',
          role: 'assistant',
          content: '收到',
          status: 'completed',
          client_message_id: null,
          created_at: '2026-05-21T00:00:00.000Z',
          updated_at: '2026-05-21T00:00:00.000Z',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const handlers: StreamChatHandlers = {
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
        content: 'hello',
        clientMessageId: 'client-1',
        searchMode: 'off',
        signal: controller.signal,
      },
      handlers,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/chat/stream',
      expect.objectContaining({
        signal: controller.signal,
      }),
    );
  });
});
