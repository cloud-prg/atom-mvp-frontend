import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import type { Conversation, Message, User } from '../types/domain';
import ChatPage from './ChatPage';

vi.mock('../api/client', () => ({
  runtime: { providerLabel: 'Test providers' },
  api: {
    listConversations: vi.fn(),
    listArchivedConversations: vi.fn(),
    getMessages: vi.fn(),
    getQuota: vi.fn(),
    deleteConversation: vi.fn(),
    createConversation: vi.fn(),
    updateConversationTitle: vi.fn(),
    streamChat: vi.fn(),
    logout: vi.fn(),
  },
}));

const user: User = {
  id: 'user-1',
  email: 'user@example.com',
  nickname: 'Tester',
  createdAt: '2026-05-21T00:00:00.000Z',
};

const conversations: Conversation[] = [
  {
    id: 'conversation-1',
    title: 'Current context',
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:01:00.000Z',
  },
  {
    id: 'conversation-2',
    title: 'Next context',
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:30.000Z',
  },
];

const archivedConversations: Conversation[] = [
  {
    id: 'conversation-archived',
    title: 'Archived roadmap',
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:10:00.000Z',
    archivedAt: '2026-05-21T00:03:00.000Z',
  },
];

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe('ChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listConversations).mockResolvedValue(conversations);
    vi.mocked(api.listArchivedConversations).mockResolvedValue(archivedConversations);
    vi.mocked(api.getMessages).mockImplementation(async (conversationId) => {
      if (conversationId === 'conversation-archived') {
        return [
          {
            id: 'message-archived',
            conversationId,
            role: 'user',
            content: 'Archived detail',
            status: 'completed',
            createdAt: '2026-05-20T00:00:00.000Z',
            updatedAt: '2026-05-20T00:00:00.000Z',
          },
        ];
      }
      return [];
    });
    vi.mocked(api.getQuota).mockResolvedValue(null);
    vi.mocked(api.deleteConversation).mockResolvedValue();
    vi.mocked(api.updateConversationTitle).mockImplementation(async (conversationId, title) => ({
      id: conversationId,
      title,
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:02:00.000Z',
    }));
  });

  it('archives the active conversation and moves to the next one', async () => {
    vi.mocked(api.getMessages).mockImplementation(async (conversationId) => {
      if (conversationId === 'conversation-1') {
        return [
          {
            id: 'message-1',
            conversationId,
            role: 'user',
            content: 'Current context detail',
            status: 'completed',
            createdAt: '2026-05-21T00:00:00.000Z',
            updatedAt: '2026-05-21T00:00:00.000Z',
          },
        ];
      }
      return [];
    });

    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
          <Route path="/chat" element={<div>Chat root</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const archiveButton = await screen.findByRole('button', { name: '归档当前对话' });

    fireEvent.click(archiveButton);

    await waitFor(() => {
      expect(api.deleteConversation).toHaveBeenCalledWith('conversation-1');
    });
    await waitFor(() => {
      expect(screen.getAllByText('Next context').length).toBeGreaterThan(0);
    });
    expect(screen.queryAllByText('Current context')).toHaveLength(1);
  });

  it('hides the archive action for a conversation without context', async () => {
    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/What will you build today/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '归档当前对话' })).not.toBeInTheDocument();
  });

  it('shows archived conversations from My Projects and opens one', async () => {
    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
          <Route path="/chat" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /home My Projects/i }));

    expect(await screen.findByRole('heading', { name: '归档会话' })).toBeInTheDocument();
    const archivedCard = await screen.findByRole('button', { name: '查看归档对话 Archived roadmap' });
    fireEvent.click(archivedCard);

    expect(await screen.findByText('Archived detail')).toBeInTheDocument();
    expect(api.getMessages).toHaveBeenCalledWith('conversation-archived');
  });

  it('tells users Resources is not available yet', async () => {
    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /resources/i }));

    expect(await screen.findByText('该功能还未开放')).toBeInTheDocument();
  });

  it('keeps the right content panel on the latest selected conversation when message loads resolve out of order', async () => {
    const firstConversationMessages = createDeferred<Message[]>();
    const secondConversationMessages = createDeferred<Message[]>();
    vi.mocked(api.getMessages).mockImplementation((conversationId) => {
      if (conversationId === 'conversation-1') return firstConversationMessages.promise;
      if (conversationId === 'conversation-2') return secondConversationMessages.promise;
      return Promise.resolve([]);
    });

    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText('Next context'));

    secondConversationMessages.resolve([
      {
        id: 'message-2',
        conversationId: 'conversation-2',
        role: 'user',
        content: 'Draw a neon poster',
        status: 'completed',
        createdAt: '2026-05-21T00:00:00.000Z',
        updatedAt: '2026-05-21T00:00:00.000Z',
      },
    ]);

    expect(await screen.findByText('Draw a neon poster')).toBeInTheDocument();

    firstConversationMessages.resolve([
      {
        id: 'message-1',
        conversationId: 'conversation-1',
        role: 'user',
        content: 'Old planning context',
        status: 'completed',
        createdAt: '2026-05-21T00:00:00.000Z',
        updatedAt: '2026-05-21T00:00:00.000Z',
      },
    ]);

    await waitFor(() => {
      expect(screen.getByText('Draw a neon poster')).toBeInTheDocument();
    });
    expect(screen.queryByText('Old planning context')).not.toBeInTheDocument();
  });

  it('shows a loading state instead of the new chat empty page while switching conversations', async () => {
    const secondConversationMessages = createDeferred<Message[]>();
    vi.mocked(api.getMessages).mockImplementation((conversationId) => {
      if (conversationId === 'conversation-2') return secondConversationMessages.promise;
      return Promise.resolve([]);
    });

    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText('Next context'));

    expect(await screen.findByLabelText('正在加载对话')).toBeInTheDocument();
    expect(screen.queryByText(/What will you build today/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Discover')).not.toBeInTheDocument();

    secondConversationMessages.resolve([
      {
        id: 'message-2',
        conversationId: 'conversation-2',
        role: 'user',
        content: 'Loaded target content',
        status: 'completed',
        createdAt: '2026-05-21T00:00:00.000Z',
        updatedAt: '2026-05-21T00:00:00.000Z',
      },
    ]);

    expect(await screen.findByText('Loaded target content')).toBeInTheDocument();
  });

  it('keeps a conversation archived locally when backend archive sync fails', async () => {
    vi.mocked(api.listArchivedConversations).mockResolvedValue([]);
    vi.mocked(api.deleteConversation).mockRejectedValueOnce(new Error('backend unavailable'));
    vi.mocked(api.getMessages).mockImplementation(async (conversationId) => {
      if (conversationId === 'conversation-1') {
        return [
          {
            id: 'message-1',
            conversationId,
            role: 'user',
            content: 'Current context detail',
            status: 'completed',
            createdAt: '2026-05-21T00:00:00.000Z',
            updatedAt: '2026-05-21T00:00:00.000Z',
          },
        ];
      }
      return [];
    });

    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
          <Route path="/chat" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '归档当前对话' }));

    await waitFor(() => {
      expect(screen.queryByText('Current context')).not.toBeInTheDocument();
    });
    fireEvent.click(await screen.findByRole('button', { name: /home My Projects/i }));

    expect(await screen.findByRole('button', { name: '查看归档对话 Current context' })).toBeInTheDocument();
  });

  it('opens the file picker from the attachment button and shows the selected file', async () => {
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '添加附件' }));

    expect(inputClick).toHaveBeenCalled();

    const fileInput = screen.getByLabelText('选择附件');
    const file = new File(['hello'], 'brief.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText('brief.pdf')).toBeInTheDocument();
  });

  it('limits the file picker to documents, spreadsheets, and images', async () => {
    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText('选择附件')).toHaveAttribute(
      'accept',
      [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/*',
        '.pdf',
        '.doc',
        '.docx',
        '.xls',
        '.xlsx',
      ].join(','),
    );
  });

  it('ignores unsupported attachment types before sending', async () => {
    vi.mocked(api.streamChat).mockResolvedValue();

    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    const unsupported = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(await screen.findByLabelText('选择附件'), { target: { files: [unsupported] } });
    fireEvent.change(screen.getByPlaceholderText('Ask Atom to build a web app.'), {
      target: { value: '总结附件' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(api.streamChat).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '总结附件',
          attachments: [],
        }),
        expect.any(Object),
      );
    });
  });

  it('sends the selected search mode with the chat request', async () => {
    vi.mocked(api.streamChat).mockResolvedValue();

    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('radio', { name: '搜索' }));
    fireEvent.change(screen.getByPlaceholderText('Ask Atom to build a web app.'), {
      target: { value: '查一下今天的行业新闻' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => {
      expect(api.streamChat).toHaveBeenCalledWith(
        expect.objectContaining({
          searchMode: 'force',
          content: '查一下今天的行业新闻',
        }),
        expect.any(Object),
      );
    });
  });

  it('retries an interrupted assistant response with the previous user prompt', async () => {
    vi.mocked(api.getMessages).mockImplementation(async (conversationId) => {
      if (conversationId !== 'conversation-1') return [];
      return [
        {
          id: 'message-user-1',
          conversationId,
          role: 'user',
          content: '上一条真正的问题',
          status: 'completed',
          createdAt: '2026-05-21T00:00:00.000Z',
          updatedAt: '2026-05-21T00:00:00.000Z',
        },
        {
          id: 'message-assistant-1',
          conversationId,
          role: 'assistant',
          content: '半截回答',
          status: 'interrupted',
          createdAt: '2026-05-21T00:00:01.000Z',
          updatedAt: '2026-05-21T00:00:01.000Z',
        },
      ];
    });
    vi.mocked(api.streamChat).mockResolvedValue();

    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('半截回答')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /重试/ }));

    await waitFor(() => {
      expect(api.streamChat).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conversation-1',
          content: '上一条真正的问题',
        }),
        expect.any(Object),
      );
    });
  });

  it('does not switch back when an in-flight stream emits after the user opens another conversation', async () => {
    let streamHandlers: Parameters<typeof api.streamChat>[1] | undefined;
    vi.mocked(api.streamChat).mockImplementation((_params, handlers) => {
      streamHandlers = handlers;
      return new Promise(() => undefined);
    });
    vi.mocked(api.getMessages).mockImplementation(async (conversationId) => {
      if (conversationId === 'conversation-2') {
        return [
          {
            id: 'message-2',
            conversationId,
            role: 'user',
            content: 'Conversation two content',
            status: 'completed',
            createdAt: '2026-05-21T00:00:00.000Z',
            updatedAt: '2026-05-21T00:00:00.000Z',
          },
        ];
      }
      return [];
    });

    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByPlaceholderText('Ask Atom to build a web app.'), {
      target: { value: 'Long running answer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'send' }));
    await waitFor(() => expect(streamHandlers).toBeDefined());

    fireEvent.click(screen.getByText('Next context'));
    expect(await screen.findByText('Conversation two content')).toBeInTheDocument();

    streamHandlers?.onConversation({
      id: 'conversation-1',
      title: 'Current context updated',
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:02:00.000Z',
    });
    streamHandlers?.onAssistantMessage({
      id: 'assistant-1',
      conversationId: 'conversation-1',
      role: 'assistant',
      content: 'Old stream content',
      status: 'streaming',
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:00.000Z',
    });

    await waitFor(() => {
      expect(screen.getByText('Conversation two content')).toBeInTheDocument();
    });
    expect(screen.queryByText('Old stream content')).not.toBeInTheDocument();
  });

  it('sends selected attachments with the chat request', async () => {
    vi.mocked(api.streamChat).mockResolvedValue();

    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    const file = new File(['report'], 'report.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    fireEvent.change(await screen.findByLabelText('选择附件'), { target: { files: [file] } });
    fireEvent.change(screen.getByPlaceholderText('Ask Atom to build a web app.'), {
      target: { value: '总结这个文件' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => {
      expect(api.streamChat).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '总结这个文件',
          attachments: [file],
        }),
        expect.any(Object),
      );
    });
  });

  it('shows a stop button while streaming and aborts the current stream when clicked', async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(api.streamChat).mockImplementation((params, handlers) => {
      signal = params.signal;
      handlers.onAssistantMessage({
        id: 'assistant-streaming',
        conversationId: 'conversation-1',
        role: 'assistant',
        content: '',
        status: 'streaming',
        createdAt: '2026-05-21T00:00:00.000Z',
        updatedAt: '2026-05-21T00:00:01.000Z',
      });
      return new Promise(() => undefined);
    });

    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByPlaceholderText('Ask Atom to build a web app.'), {
      target: { value: '先生成一个方案' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '停止生成' })).toBeInTheDocument();
    });
    expect(screen.getByText('对话生成中')).toBeInTheDocument();
    expect(signal?.aborted).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '停止生成' }));

    expect(signal?.aborted).toBe(true);
    await waitFor(() => {
      expect(screen.queryByText('对话生成中')).not.toBeInTheDocument();
    });
  });

  it('queues prompts typed while streaming and sends them after the current answer finishes', async () => {
    let firstHandlers: Parameters<typeof api.streamChat>[1] | undefined;
    const firstStream = createDeferred<void>();
    vi.mocked(api.streamChat)
      .mockImplementationOnce((_params, handlers) => {
        firstHandlers = handlers;
        return firstStream.promise;
      })
      .mockResolvedValueOnce();

    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    const composer = await screen.findByPlaceholderText('Ask Atom to build a web app.');
    fireEvent.change(composer, { target: { value: '先生成一个方案' } });
    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => expect(api.streamChat).toHaveBeenCalledTimes(1));
    fireEvent.change(composer, { target: { value: '再补一个风险清单' } });
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter', charCode: 13 });

    expect(await screen.findByText('等待发送')).toBeInTheDocument();
    expect(screen.getByText('再补一个风险清单')).toBeInTheDocument();
    expect(api.streamChat).toHaveBeenCalledTimes(1);

    firstHandlers?.onComplete({
      id: 'assistant-1',
      conversationId: 'conversation-1',
      role: 'assistant',
      content: '第一个回答完成',
      status: 'completed',
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:01.000Z',
    });
    firstStream.resolve();

    await waitFor(() => {
      expect(api.streamChat).toHaveBeenCalledTimes(2);
    });
    expect(api.streamChat).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: '再补一个风险清单',
      }),
      expect.any(Object),
    );
  });

  it('opens the upgrade plans when sending with no remaining messages', async () => {
    vi.mocked(api.getQuota).mockResolvedValue({
      remainingMessages: 0,
      grantedMessages: 3,
      usedMessages: 3,
    });

    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('剩余 0');
    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    expect(await screen.findByText('升级账号，继续和 Atom 对话')).toBeInTheDocument();
    expect(api.streamChat).not.toHaveBeenCalled();
  });

  it('hides quota counts for AEM users and does not block sending on zero quota', async () => {
    vi.mocked(api.getQuota).mockResolvedValue({
      remainingMessages: 0,
      grantedMessages: 3,
      usedMessages: 3,
    });
    vi.mocked(api.streamChat).mockResolvedValue();
    const aemUser: User = {
      ...user,
      id: 'user_aem',
      email: 'aem@example.com',
      nickname: 'AEM',
    };

    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={aemUser} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(api.getQuota).toHaveBeenCalled();
    });
    expect(screen.queryByText('剩余 0')).not.toBeInTheDocument();
    expect(screen.queryByText('已用 3 / 3')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Ask Atom to build a web app.'), {
      target: { value: '继续生成页面' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => {
      expect(api.streamChat).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '继续生成页面',
        }),
        expect.any(Object),
      );
    });
    expect(screen.queryByText('升级账号，继续和 Atom 对话')).not.toBeInTheDocument();
  });

  it('shows a blinking generating state without source cards while streaming', async () => {
    const streamingMessage: Message = {
      id: 'assistant-streaming',
      conversationId: 'conversation-1',
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:01.000Z',
      searchResults: [
        {
          title: 'SSE streaming for AI workbenches',
          url: 'https://example.com/sse-streaming',
          snippet: 'SSE 适合 MVP 阶段的单向 token 流。',
          source: 'mock',
        },
      ],
    };
    vi.mocked(api.getMessages).mockResolvedValue([streamingMessage]);

    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('对话生成中')).toBeInTheDocument();
    expect(screen.queryByText('来源 1')).not.toBeInTheDocument();
    expect(screen.queryByText('SSE streaming for AI workbenches')).not.toBeInTheDocument();
  });

  it('copies a historical user prompt from the message actions', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(api.getMessages).mockResolvedValue([
      {
        id: 'message-user-1',
        conversationId: 'conversation-1',
        role: 'user',
        content: 'Build an editable chat timeline',
        status: 'completed',
        createdAt: '2026-05-21T00:00:00.000Z',
        updatedAt: '2026-05-21T00:00:00.000Z',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Build an editable chat timeline')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '复制提问' }));

    expect(writeText).toHaveBeenCalledWith('Build an editable chat timeline');
  });

  it('replaces messages after an edited historical prompt and resends from that point', async () => {
    vi.mocked(api.getMessages).mockResolvedValue([
      {
        id: 'message-user-1',
        conversationId: 'conversation-1',
        role: 'user',
        content: 'Original prompt',
        status: 'completed',
        createdAt: '2026-05-21T00:00:00.000Z',
        updatedAt: '2026-05-21T00:00:00.000Z',
      },
      {
        id: 'message-assistant-1',
        conversationId: 'conversation-1',
        role: 'assistant',
        content: 'Old answer',
        status: 'completed',
        createdAt: '2026-05-21T00:00:01.000Z',
        updatedAt: '2026-05-21T00:00:01.000Z',
      },
      {
        id: 'message-user-2',
        conversationId: 'conversation-1',
        role: 'user',
        content: 'Follow-up that should disappear',
        status: 'completed',
        createdAt: '2026-05-21T00:00:02.000Z',
        updatedAt: '2026-05-21T00:00:02.000Z',
      },
    ]);
    vi.mocked(api.streamChat).mockImplementation(async (params, handlers) => {
      handlers.onUserMessage({
        id: 'message-user-edited',
        conversationId: params.conversationId ?? 'conversation-1',
        role: 'user',
        content: params.content,
        status: 'completed',
        clientMessageId: params.clientMessageId,
        createdAt: '2026-05-21T00:00:03.000Z',
        updatedAt: '2026-05-21T00:00:03.000Z',
      });
      handlers.onComplete({
        id: 'message-assistant-edited',
        conversationId: params.conversationId ?? 'conversation-1',
        role: 'assistant',
        content: 'New answer',
        status: 'completed',
        createdAt: '2026-05-21T00:00:04.000Z',
        updatedAt: '2026-05-21T00:00:04.000Z',
      });
    });

    render(
      <MemoryRouter initialEntries={['/chat/conversation-1']}>
        <Routes>
          <Route path="/chat/:conversationId" element={<ChatPage user={user} onLogout={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Original prompt')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '编辑提问' })[0]);
    fireEvent.change(screen.getByRole('textbox', { name: '编辑提问' }), {
      target: { value: 'Edited prompt' },
    });
    fireEvent.click(screen.getByRole('button', { name: /发送/ }));

    await waitFor(() => {
      expect(api.streamChat).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conversation-1',
          content: 'Edited prompt',
          replaceAfterMessageId: 'message-user-1',
        }),
        expect.any(Object),
      );
    });
    expect(await screen.findByText('Edited prompt')).toBeInTheDocument();
    expect(await screen.findByText('New answer')).toBeInTheDocument();
    expect(screen.queryByText('Original prompt')).not.toBeInTheDocument();
    expect(screen.queryByText('Old answer')).not.toBeInTheDocument();
    expect(screen.queryByText('Follow-up that should disappear')).not.toBeInTheDocument();
  });
});
