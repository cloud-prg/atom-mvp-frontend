import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Empty, Input, Modal, Radio, Space, Tag, Tooltip, message } from 'antd';
import {
  AppstoreOutlined,
  ArrowUpOutlined,
  BellOutlined,
  CheckOutlined,
  CloseOutlined,
  CompassOutlined,
  ControlOutlined,
  DeleteOutlined,
  DownOutlined,
  GiftOutlined,
  HomeOutlined,
  LogoutOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  SettingOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import { ApiRequestError } from '../api/realApi';
import { api, runtime } from '../api/client';
import { clearDraft, loadDraft, saveDraft } from '../api/storage';
import type { Conversation, Message, MessageQuota, SearchMode, User } from '../types/domain';
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
  const [quota, setQuota] = useState<MessageQuota | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const remainingMessages = quota?.remainingMessages;
  const copy = language === 'zh'
    ? {
        newChat: '新对话',
        history: '对话历史',
        resources: 'Resources',
        projects: 'My Projects',
        freeCredits: 'Get Free Credits',
        freeCreditsHint: 'Get 10 credits each',
        buildMode: 'Build',
        themePreset: 'Theme',
        connectTools: 'Connect your tools to Atom',
        discover: 'Discover',
        templates: 'Templates',
        viewAll: 'View All',
        settings: '设置',
        language: '语言',
        theme: '主题',
        light: '浅色',
        dark: '深色',
        titleFallback: '新对话',
        subtitle: '把想法、调研和执行步骤放进同一个 AI 工作台。',
        emptyTitle: `What will you build today, ${user.nickname || 'there'}?`,
        emptySubtitle: 'Introduce Goal  •  Plan the steps and execute iteratively',
        placeholder: remainingMessages === 0 ? '试用次数已用完，点击发送查看升级方案' : 'Ask Atom to build a web app.',
        quota: '剩余',
        used: '已用',
        logout: '退出',
      }
    : {
        newChat: 'New chat',
        history: 'Chat history',
        resources: 'Resources',
        projects: 'My Projects',
        freeCredits: 'Get Free Credits',
        freeCreditsHint: 'Get 10 credits each',
        buildMode: 'Build',
        themePreset: 'Theme',
        connectTools: 'Connect your tools to Atom',
        discover: 'Discover',
        templates: 'Templates',
        viewAll: 'View All',
        settings: 'Settings',
        language: 'Language',
        theme: 'Theme',
        light: 'Light',
        dark: 'Dark',
        titleFallback: 'New chat',
        subtitle: 'Plan ideas, research, and execution in one AI workspace.',
        emptyTitle: `What will you build today, ${user.nickname || 'there'}?`,
        emptySubtitle: 'Introduce Goal  •  Plan the steps and execute iteratively',
        placeholder: remainingMessages === 0 ? 'Trial messages are used up. Send to view upgrade plans' : 'Ask Atom to build a web app.',
        quota: 'Remaining',
        used: 'Used',
        logout: 'Logout',
      };

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
    refreshQuota();
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

  async function refreshQuota() {
    try {
      setQuota(await api.getQuota());
    } catch {
      setQuota(null);
    }
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
    if (quota && quota.remainingMessages <= 0) {
      setUpgradeOpen(true);
      return;
    }

    setStreaming(true);
    const clientMessageId = createId('client');
    if (activeId) clearDraft(user.id, activeId);
    setDraft('');

    try {
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
            api.listConversations().then(setConversations);
            refreshQuota();
          },
        },
      );
    } catch (error) {
      if ((error instanceof ApiRequestError && error.status === 402) || (error instanceof Error && error.message.includes('quota'))) {
        await refreshQuota();
        setUpgradeOpen(true);
        return;
      }
      message.error('发送失败，请稍后重试');
    } finally {
      setStreaming(false);
    }
  }

  async function handleRetry(messageItem: Message) {
    await handleSend(messageItem.content || '继续完成上一次回答');
  }

  async function handleLogout() {
    await api.logout();
    onLogout();
    navigate('/login', { replace: true });
  }

  function renderComposer(compact = false) {
    return (
      <div className={`${styles.composer} ${compact ? styles.heroComposer : ''}`}>
        {quota && !compact && (
          <div className={styles.quotaNotice}>
            <span>{copy.quota}</span>
            <strong>{quota.remainingMessages}</strong>
            <small>{copy.used} {quota.usedMessages} / {quota.grantedMessages}</small>
          </div>
        )}
        <Input.TextArea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          autoSize={{ minRows: compact ? 2 : 1, maxRows: 5 }}
          placeholder={copy.placeholder}
        />
        <div className={styles.composerActions}>
          <div className={styles.actionCluster}>
            <Tooltip title={copy.newChat}>
              <button className={styles.roundAction} type="button" onClick={handleNewChat} aria-label={copy.newChat}>
                <PlusOutlined />
              </button>
            </Tooltip>
            <button className={styles.themeButton} type="button">
              <ControlOutlined />
              <span>{copy.themePreset}</span>
              <DownOutlined />
            </button>
          </div>
          <div className={styles.actionCluster}>
            <Radio.Group
              className={styles.modeSwitch}
              optionType="button"
              buttonStyle="solid"
              value={searchMode}
              onChange={(event) => setSearchMode(event.target.value)}
              options={[
                { label: language === 'zh' ? '不搜索' : 'Off', value: 'off' },
                { label: language === 'zh' ? '自动' : 'Auto', value: 'auto' },
                { label: language === 'zh' ? '搜索' : 'Search', value: 'force' },
              ]}
            />
            <Button
              type="primary"
              shape="circle"
              size="large"
              icon={compact ? <ArrowUpOutlined /> : <SendOutlined />}
              loading={streaming}
              onClick={() => handleSend()}
              aria-label="send"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className={`${styles.shell} ${theme === 'dark' ? styles.dark : styles.light}`}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.brand}>
            <div className={styles.brandMark}>A</div>
            <div className={styles.logo}>Atoms</div>
          </div>
          <Tooltip title={copy.projects}>
            <button className={styles.sidebarToggle} type="button" aria-label={copy.projects}>
              <AppstoreOutlined />
            </button>
          </Tooltip>
        </div>

        <button className={styles.workspaceSelect} type="button">
          <span className={styles.workspaceAvatar}>{user.nickname?.slice(0, 1).toUpperCase() || 'A'}</span>
          <span>{user.nickname || 'Atom'}'s Atoms</span>
          <DownOutlined />
        </button>

        <button className={styles.navItem} onClick={handleNewChat}>
          <PlusOutlined />
          <span>New Project</span>
        </button>
        <button className={`${styles.navItem} ${styles.navItemActive}`} type="button">
          <CompassOutlined />
          <span>{copy.resources}</span>
        </button>
        <button className={styles.navItem} type="button">
          <HomeOutlined />
          <span>{copy.projects}</span>
        </button>

        <div className={styles.sectionTitle}>Recents</div>
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

        <div className={styles.sidebarFooter}>
          <button className={styles.creditsCard} type="button" onClick={() => setUpgradeOpen(true)}>
            <GiftOutlined />
            <span>
              <strong>{copy.freeCredits}</strong>
              <small>{copy.freeCreditsHint}</small>
            </span>
            <DownOutlined />
          </button>
          <div className={styles.bottomDock}>
            <div className={styles.userAvatar}>{user.nickname?.slice(0, 1).toUpperCase() || 'A'}</div>
            <button className={styles.dockIcon} type="button" aria-label={copy.projects}><HomeOutlined /></button>
            <details className={styles.settingsDetails}>
              <summary className={styles.dockIcon} aria-label={copy.settings}>
                <SettingOutlined />
              </summary>
              <div className={styles.settingsPanel}>
                <div className={styles.settingGroup}>
                  <span>{copy.language}</span>
                  <Radio.Group
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                    options={[
                      { label: '中文', value: 'zh' },
                      { label: 'English', value: 'en' },
                    ]}
                  />
                </div>
                <div className={styles.settingGroup}>
                  <span>{copy.theme}</span>
                  <Radio.Group
                    value={theme}
                    onChange={(event) => setTheme(event.target.value)}
                    options={[
                      { label: copy.light, value: 'light' },
                      { label: copy.dark, value: 'dark' },
                    ]}
                  />
                </div>
              </div>
            </details>
            <button className={styles.dockIcon} type="button" aria-label="Notifications"><BellOutlined /></button>
            <Tooltip title={copy.logout}>
              <button className={styles.dockIcon} type="button" onClick={handleLogout} aria-label={copy.logout}>
                <LogoutOutlined />
              </button>
            </Tooltip>
          </div>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div />
          <Space>
            {quota && <Tag color={quota.remainingMessages > 0 ? 'success' : 'warning'}>{copy.quota} {quota.remainingMessages}</Tag>}
            <Tag icon={<WifiOutlined />} color="default">
              {runtime.providerLabel}
            </Tag>
            <Tag color={navigator.onLine ? 'success' : 'warning'}>{navigator.onLine ? 'Online' : 'Offline'}</Tag>
          </Space>
        </header>

        <div className={styles.messagePanel}>
          {messages.length === 0 ? (
            <div className={styles.emptyHero}>
              <div className={styles.orbit}>
                <span>{copy.emptySubtitle}</span>
                <CloseOutlined />
              </div>
              <div className={styles.agentStack} aria-hidden="true">
                {['🐶', '👶', '🕵', '🐷', '🤖', '🐧', '🐸', '👾'].map((agent, index) => (
                  <span key={`${agent}-${index}`}>{agent}</span>
                ))}
              </div>
              <h2>{copy.emptyTitle}</h2>
              {renderComposer(true)}
              <div className={styles.toolStrip}>
                <span><ControlOutlined /> {copy.connectTools}</span>
                <div className={styles.toolIcons}>
                  {['D', 'F', 'G', 'A', 'N', 'I'].map((tool) => <i key={tool}>{tool}</i>)}
                </div>
                <CloseOutlined />
              </div>
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

        {messages.length > 0 && <footer>{renderComposer()}</footer>}

        {messages.length === 0 && (
          <section className={styles.discoverPanel}>
            <div className={styles.discoverTabs}>
              <button className={styles.discoverActive} type="button">{copy.discover}</button>
              <button type="button">{copy.projects}</button>
              <button type="button">{copy.templates}</button>
            </div>
            <button className={styles.viewAll} type="button">
              {copy.viewAll}
              <DownOutlined />
            </button>
            <div className={styles.projectPreviewGrid}>
              <div className={styles.previewCard} />
              <div className={styles.previewCard} />
              <div className={styles.previewCard} />
            </div>
          </section>
        )}
      </section>
      <Modal
        open={upgradeOpen}
        footer={null}
        centered
        width={720}
        onCancel={() => setUpgradeOpen(false)}
        className={styles.upgradeModal}
      >
        <div className={styles.upgradeHeader}>
          <span className={styles.upgradeEyebrow}>LIMIT REACHED</span>
          <h2>升级账号，继续和 Atom 对话</h2>
          <p>你的试用提问次数已经用完。选择会员套餐即可继续使用更高额度、更稳定的模型能力和优先响应。</p>
        </div>
        <div className={styles.planGrid}>
          <section className={styles.planCard}>
            <div>
              <span className={styles.planName}>月付</span>
              <strong>¥29</strong>
              <small>/ 月</small>
            </div>
            <ul>
              <li><CheckOutlined /> 每月 300 次高质量提问</li>
              <li><CheckOutlined /> 更快的流式响应</li>
              <li><CheckOutlined /> 灵活续订，随时调整</li>
            </ul>
            <Button type="primary" block onClick={() => message.info('支付接入即将开放')}>
              选择月付
            </Button>
          </section>
          <section className={`${styles.planCard} ${styles.planCardFeatured}`}>
            <div>
              <span className={styles.planName}>季付</span>
              <strong>¥69</strong>
              <small>/ 季，折合 ¥23/月</small>
              <em>每月省 ¥6</em>
            </div>
            <ul>
              <li><CheckOutlined /> 每月 300 次高质量提问</li>
              <li><CheckOutlined /> 优先使用高级模型</li>
              <li><CheckOutlined /> 适合稳定使用</li>
            </ul>
            <Button type="primary" block onClick={() => message.info('支付接入即将开放')}>
              选择季付
            </Button>
          </section>
          <section className={styles.planCard}>
            <div>
              <span className={styles.planName}>年付</span>
              <strong>¥199</strong>
              <small>/ 年，折合约 ¥16.6/月</small>
              <em>每月省约 ¥12.4</em>
            </div>
            <ul>
              <li><CheckOutlined /> 每月 300 次高质量提问</li>
              <li><CheckOutlined /> 年度最佳价格</li>
              <li><CheckOutlined /> 适合长期工作流</li>
            </ul>
            <Button type="primary" block onClick={() => message.info('支付接入即将开放')}>
              选择年付
            </Button>
          </section>
        </div>
      </Modal>
    </main>
  );
}
