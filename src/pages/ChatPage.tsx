import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Empty, Input, Radio, Space, Tag, Tooltip, message } from 'antd';
import {
  DeleteOutlined,
  LogoutOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import { api, runtime } from '../api/client';
import { clearDraft, loadDraft, saveDraft } from '../api/storage';
import type { Conversation, Message, SearchMode, User } from '../types/domain';
import { createId } from '../utils/id';
import styles from './ChatPage.module.css';

interface ChatPageProps {
  user: User;
  onLogout: () => void;
}

export default function ChatPage({ user, onLogout }: ChatPageProps) {
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(conversationId);
  const [draft, setDraft] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('auto');
  const [streaming, setStreaming] = useState(false);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId),
    [activeId, conversations],
  );

  useEffect(() => {
    api.listConversations().then((items) => {
      setConversations(items);
      if (conversationId) {
        setActiveId(conversationId);
      } else if (items[0]) {
        setActiveId(items[0].id);
        navigate(`/chat/${items[0].id}`, { replace: true });
      }
    });
  }, [conversationId, navigate]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setDraft('');
      return;
    }
    api.getMessages(activeId).then(setMessages);
    setDraft(loadDraft(user.id, activeId));
  }, [activeId, user.id]);

  useEffect(() => {
    if (activeId) {
      saveDraft(user.id, activeId, draft);
    }
  }, [activeId, draft, user.id]);

  function upsertMessage(next: Message) {
    setMessages((current) => current.map((message) => (message.id === next.id ? next : message)));
  }

  async function handleNewChat() {
    const conversation = await api.createConversation();
    setConversations((current) => [conversation, ...current]);
    setActiveId(conversation.id);
    setMessages([]);
    navigate(`/chat/${conversation.id}`);
  }

  async function handleDelete(conversation: Conversation) {
    await api.deleteConversation(conversation.id);
    const next = conversations.filter((item) => item.id !== conversation.id);
    setConversations(next);
    if (conversation.id === activeId) {
      const fallback = next[0];
      setActiveId(fallback?.id);
      navigate(fallback ? `/chat/${fallback.id}` : '/chat', { replace: true });
    }
  }

  async function handleSend(contentOverride?: string) {
    const content = (contentOverride ?? draft).trim();
    if (!content || streaming) return;

    setStreaming(true);
    const clientMessageId = createId('client');
    if (activeId) clearDraft(user.id, activeId);
    setDraft('');

    await api.streamChat(
      {
        conversationId: activeId,
        content,
        clientMessageId,
        searchMode,
      },
      {
        onConversation: (conversation) => {
          setActiveId(conversation.id);
          setConversations((current) => [conversation, ...current]);
          navigate(`/chat/${conversation.id}`, { replace: true });
        },
        onUserMessage: (message) => setMessages((current) => [...current, message]),
        onAssistantMessage: (message) => setMessages((current) => [...current, message]),
        onSearch: (results) => {
          setMessages((current) => {
            const latestAssistant = [...current].reverse().find((item) => item.role === 'assistant');
            if (!latestAssistant) return current;
            return current.map((item) => (item.id === latestAssistant.id ? { ...item, searchResults: results } : item));
          });
        },
        onDelta: upsertMessage,
        onComplete: (message) => {
          upsertMessage(message);
          setStreaming(false);
          api.listConversations().then(setConversations);
        },
      },
    );
  }

  async function handleRetry(messageItem: Message) {
    await handleSend(messageItem.content || '继续完成上一次回答');
  }

  async function handleLogout() {
    await api.logout();
    onLogout();
    navigate('/login', { replace: true });
  }

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div>
            <div className={styles.logo}>Atom MVP</div>
            <div className={styles.muted}>Personal AI workbench</div>
          </div>
          <Tooltip title="新聊天">
            <Button shape="circle" type="primary" icon={<PlusOutlined />} onClick={handleNewChat} />
          </Tooltip>
        </div>

        <div className={styles.conversationList}>
          {conversations.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无会话" />
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={`${styles.conversationItem} ${conversation.id === activeId ? styles.active : ''}`}
                onClick={() => {
                  setActiveId(conversation.id);
                  navigate(`/chat/${conversation.id}`);
                }}
              >
                <span>{conversation.title}</span>
                <DeleteOutlined
                  className={styles.deleteIcon}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDelete(conversation);
                  }}
                />
              </button>
            ))
          )}
        </div>

        <div className={styles.userCard}>
          <div>
            <strong>{user.nickname}</strong>
            <div className={styles.muted}>{user.email}</div>
          </div>
          <Button icon={<LogoutOutlined />} onClick={handleLogout}>
            退出
          </Button>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <h1>{activeConversation?.title ?? '新聊天'}</h1>
            <p>已启用刷新恢复、草稿保存、Mock streaming 与搜索引用。</p>
          </div>
          <Space>
            <Tag icon={<WifiOutlined />} color="default">
              {runtime.providerLabel}
            </Tag>
            <Tag color={navigator.onLine ? 'success' : 'warning'}>{navigator.onLine ? 'Online' : 'Offline'}</Tag>
          </Space>
        </header>

        <div className={styles.messagePanel}>
          {messages.length === 0 ? (
            <div className={styles.emptyHero}>
              <h2>你今天想构建什么？</h2>
              <p>试试问：这个 MVP 的刷新恢复怎么设计？或者打开联网搜索模式看引用卡片。</p>
              <Button type="primary" onClick={() => handleSend('这个 MVP 的刷新恢复怎么设计？')}>
                生成一条示例对话
              </Button>
            </div>
          ) : (
            messages.map((item) => (
              <article key={item.id} className={`${styles.message} ${styles[item.role]}`}>
                <div className={styles.messageMeta}>
                  <span>{item.role === 'user' ? user.nickname : 'Atom Assistant'}</span>
                  <Tag>{item.status}</Tag>
                </div>
                <div className={styles.messageContent}>{item.content || (item.status === 'streaming' ? '正在生成...' : '')}</div>
                {item.searchResults && item.searchResults.length > 0 && (
                  <div className={styles.sources}>
                    {item.searchResults.map((result, index) => (
                      <a key={result.url} href={result.url} target="_blank" rel="noreferrer" className={styles.sourceCard}>
                        <span>来源 {index + 1}</span>
                        <strong>{result.title}</strong>
                        <small>{result.snippet}</small>
                      </a>
                    ))}
                  </div>
                )}
                {(item.status === 'failed' || item.status === 'interrupted') && (
                  <Button icon={<ReloadOutlined />} onClick={() => handleRetry(item)}>
                    重试
                  </Button>
                )}
              </article>
            ))
          )}
        </div>

        <footer className={styles.composer}>
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            value={searchMode}
            onChange={(event) => setSearchMode(event.target.value)}
            options={[
              { label: '不搜索', value: 'off' },
              { label: '自动', value: 'auto' },
              { label: '强制搜索', value: 'force' },
            ]}
          />
          <div className={styles.inputRow}>
            <Input.TextArea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onPressEnter={(event) => {
                if (!event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              autoSize={{ minRows: 1, maxRows: 5 }}
              placeholder="告诉 Atom 你要完成什么..."
            />
            <Button type="primary" size="large" icon={<SendOutlined />} loading={streaming} onClick={() => handleSend()}>
              发送
            </Button>
          </div>
        </footer>
      </section>
    </main>
  );
}

