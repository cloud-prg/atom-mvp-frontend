import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Dropdown, Empty, Input, Modal, Radio, Space, Tag, Tooltip, message } from 'antd';
import {
  AppstoreOutlined,
  ArrowUpOutlined,
  BellOutlined,
  CalendarOutlined,
  CheckOutlined,
  CloseOutlined,
  CompassOutlined,
  ControlOutlined,
  CopyOutlined,
  DownOutlined,
  EditOutlined,
  GiftOutlined,
  HomeOutlined,
  LogoutOutlined,
  MoreOutlined,
  PaperClipOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  SettingOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import { ApiRequestError } from '../api/realApi';
import { api, runtime } from '../api/client';
import { archiveConversationSnapshot, clearDraft, loadDraft, saveDraft } from '../api/storage';
import type { Conversation, Message, MessageQuota, SearchMode, User } from '../types/domain';
import { createId } from '../utils/id';
import styles from './ChatPage.module.css';

interface ChatPageProps {
  user: User;
  onLogout: () => void;
}

const supportedAttachmentTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/*',
];
const supportedAttachmentExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];
const attachmentAccept = [...supportedAttachmentTypes, ...supportedAttachmentExtensions].join(',');

function isSupportedAttachment(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return (
    file.type.startsWith('image/') ||
    supportedAttachmentTypes.includes(file.type) ||
    supportedAttachmentExtensions.some((extension) => lowerName.endsWith(extension))
  );
}

function isUnlimitedMessagesUser(user: User): boolean {
  const accountNames = [
    user.id.replace(/^user_/i, ''),
    user.email.split('@')[0],
    user.nickname,
  ].map((value) => value.trim().toLowerCase());

  return accountNames.some((value) => value === 'admin' || value === 'aem');
}

function mergeConversationsById(primary: Conversation[], secondary: Conversation[]): Conversation[] {
  return [
    ...primary,
    ...secondary.filter((conversation) => !primary.some((item) => item.id === conversation.id)),
  ];
}

export default function ChatPage({ user, onLogout }: ChatPageProps) {
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [archivedConversations, setArchivedConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | undefined>(conversationId);
  const [viewMode, setViewMode] = useState<'chat' | 'projects'>(conversationId ? 'chat' : 'chat');
  const [draft, setDraft] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('auto');
  const [streaming, setStreaming] = useState(false);
  const [quota, setQuota] = useState<MessageQuota | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState('');
  const [pendingPrompts, setPendingPrompts] = useState<string[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversationListRef = useRef<HTMLDivElement>(null);
  const streamFrameRef = useRef<number | null>(null);
  const pendingDeltaRef = useRef<Message | null>(null);
  const activeIdRef = useRef<string | undefined>(conversationId);
  const pendingPromptsRef = useRef<string[]>([]);
  const streamAbortRef = useRef<AbortController | null>(null);
  const hasUnlimitedMessages = useMemo(() => isUnlimitedMessagesUser(user), [user]);
  const isQuotaExhausted = Boolean(!hasUnlimitedMessages && quota && quota.remainingMessages <= 0);
  const shouldShowQuota = Boolean(!hasUnlimitedMessages && quota);
  const copy = language === 'zh'
    ? {
        newChat: '新对话',
        history: '对话历史',
        resources: 'Resources',
        resourcesUnavailable: '该功能还未开放',
        projects: 'My Projects',
        projectsTitle: '归档会话',
        projectsSubtitle: '这里会保留你归档过的对话，点击任意一项即可进入详情继续查看上下文。',
        archivedCount: '个归档',
        noArchivedTitle: '暂无归档会话',
        noArchivedDescription: '从会话右上角或侧边栏菜单归档后，会出现在这里。',
        openArchived: '查看归档对话',
        archivedOn: '归档时间',
        hideSidebar: '收起侧边栏',
        showSidebar: '展开侧边栏',
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
        placeholder: isQuotaExhausted ? '试用次数已用完，点击发送查看升级方案' : 'Ask Atom to build a web app.',
        quota: '剩余',
        used: '已用',
        logout: '退出',
        archiveCurrent: '归档当前对话',
        renameConversation: '修改名称',
        renameTitle: '修改会话名称',
        renamePlaceholder: '输入新的会话名称',
        renameSuccess: '会话名称已更新',
        renameFailed: '修改失败，请稍后重试',
        renameEmpty: '请输入会话名称',
        attachFile: '添加附件',
        chooseAttachment: '选择附件',
        removeAttachment: '移除附件',
        unsupportedAttachment: '仅支持 PDF、Word、Excel 和图片文件',
        conversationActions: '会话操作',
        archiveSuccess: '已归档当前对话',
        archiveFailed: '归档失败，请稍后重试',
        waitingToSend: '等待发送',
        copyMessage: '复制提问',
        copySuccess: '已复制',
        copyFailed: '复制失败，请手动选择文本复制',
        editMessage: '编辑提问',
        cancelEdit: '取消编辑',
        sendEdit: '发送',
        editEmpty: '提问内容不能为空',
        stopGenerating: '停止生成',
      }
    : {
        newChat: 'New chat',
        history: 'Chat history',
        resources: 'Resources',
        resourcesUnavailable: 'This feature is not available yet',
        projects: 'My Projects',
        projectsTitle: 'Archived chats',
        projectsSubtitle: 'Your archived conversations stay here. Open any item to review the full context.',
        archivedCount: 'archived',
        noArchivedTitle: 'No archived chats yet',
        noArchivedDescription: 'Archive a chat from the header or sidebar menu and it will appear here.',
        openArchived: 'Open archived chat',
        archivedOn: 'Archived',
        hideSidebar: 'Collapse sidebar',
        showSidebar: 'Expand sidebar',
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
        placeholder: isQuotaExhausted ? 'Trial messages are used up. Send to view upgrade plans' : 'Ask Atom to build a web app.',
        quota: 'Remaining',
        used: 'Used',
        logout: 'Logout',
        archiveCurrent: 'Archive current chat',
        renameConversation: 'Rename',
        renameTitle: 'Rename chat',
        renamePlaceholder: 'Enter a new chat name',
        renameSuccess: 'Chat name updated',
        renameFailed: 'Rename failed. Please try again',
        renameEmpty: 'Please enter a chat name',
        attachFile: 'Attach file',
        chooseAttachment: 'Choose attachment',
        removeAttachment: 'Remove attachment',
        unsupportedAttachment: 'Only PDF, Word, Excel, and image files are supported',
        conversationActions: 'Chat actions',
        archiveSuccess: 'Current chat archived',
        archiveFailed: 'Archive failed. Please try again',
        waitingToSend: 'Waiting to send',
        copyMessage: 'Copy prompt',
        copySuccess: 'Copied',
        copyFailed: 'Copy failed. Please select the text manually',
        editMessage: 'Edit prompt',
        cancelEdit: 'Cancel edit',
        sendEdit: 'Send',
        editEmpty: 'Prompt cannot be empty',
        stopGenerating: 'Stop generating',
      };

  const activeConversation = useMemo(
    () => [...conversations, ...archivedConversations].find((conversation) => conversation.id === activeId),
    [activeId, archivedConversations, conversations],
  );
  const canArchiveActiveConversation = Boolean(
    viewMode === 'chat'
    && activeConversation
    && !activeConversation.archivedAt
    && !messagesLoading
    && messages.length > 0
    && !streaming,
  );

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    pendingPromptsRef.current = pendingPrompts;
  }, [pendingPrompts]);

  useEffect(() => {
    api.listConversations().then((items) => {
      setConversations(items);
      if (conversationId) {
        setActiveId(conversationId);
        setViewMode('chat');
      } else if (items[0]) {
        setActiveId(items[0].id);
        navigate(`/chat/${items[0].id}`, { replace: true });
      }
    });
    api.listArchivedConversations()
      .then((items) => setArchivedConversations((current) => mergeConversationsById(current, items)))
      .catch(() => setArchivedConversations((current) => current));
    refreshQuota();
  }, [conversationId, navigate]);

  useEffect(() => {
    if (!activeId) {
      setMessagesLoading(false);
      setMessages([]);
      setDraft('');
      return;
    }
    let cancelled = false;
    setMessagesLoading(true);
    setMessages([]);
    api.getMessages(activeId).then((items) => {
      if (!cancelled) {
        setMessages(items);
        setMessagesLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setMessagesLoading(false);
      }
    });
    setDraft(loadDraft(user.id, activeId));

    return () => {
      cancelled = true;
    };
  }, [activeId, user.id]);

  useEffect(() => {
    if (activeId) {
      saveDraft(user.id, activeId, draft);
    }
  }, [activeId, draft, user.id]);

  useEffect(() => {
    const typingDelay = 120;
    const characterDuration = 55;
    const completedPause = 3000;
    const cycleDuration = typingDelay + copy.placeholder.length * characterDuration + completedPause;
    let animationFrameId = 0;
    let cycleStartedAt: number | null = null;
    let lastVisibleLength = -1;

    setAnimatedPlaceholder('');

    function animatePlaceholder(timestamp: number) {
      if (cycleStartedAt === null) {
        cycleStartedAt = timestamp;
      }

      const elapsed = (timestamp - cycleStartedAt) % cycleDuration;
      const typingElapsed = elapsed - typingDelay;
      const visibleLength = typingElapsed <= 0
        ? 0
        : Math.min(copy.placeholder.length, Math.floor(typingElapsed / characterDuration) + 1);

      if (visibleLength !== lastVisibleLength) {
        lastVisibleLength = visibleLength;
        setAnimatedPlaceholder(copy.placeholder.slice(0, visibleLength));
      }

      animationFrameId = window.requestAnimationFrame(animatePlaceholder);
    }

    animationFrameId = window.requestAnimationFrame(animatePlaceholder);

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [copy.placeholder]);

  useEffect(() => () => {
    if (streamFrameRef.current !== null) {
      window.cancelAnimationFrame(streamFrameRef.current);
    }
  }, []);

  function upsertMessage(next: Message) {
    setMessages((current) => {
      if (current.some((message) => message.id === next.id)) {
        return current.map((message) => (message.id === next.id ? next : message));
      }
      return [...current, next];
    });
  }

  function flushStreamingDelta() {
    streamFrameRef.current = null;
    const next = pendingDeltaRef.current;
    pendingDeltaRef.current = null;
    if (next) {
      upsertMessage(next);
    }
  }

  function queueStreamingDelta(next: Message) {
    pendingDeltaRef.current = next;
    if (streamFrameRef.current === null) {
      streamFrameRef.current = window.requestAnimationFrame(flushStreamingDelta);
    }
  }

  function interruptVisibleStreamingMessage() {
    pendingDeltaRef.current = null;
    if (streamFrameRef.current !== null) {
      window.cancelAnimationFrame(streamFrameRef.current);
      streamFrameRef.current = null;
    }
    setMessages((current) => current.map((messageItem) => (
      messageItem.role === 'assistant' && messageItem.status === 'streaming'
        ? { ...messageItem, status: 'interrupted', updatedAt: new Date().toISOString() }
        : messageItem
    )));
  }

  function appendMessage(next: Message) {
    setMessages((current) => {
      if (current.some((message) => message.id === next.id)) {
        return current.map((message) => (message.id === next.id ? next : message));
      }
      return [...current, next];
    });
  }

  async function handleCopyMessage(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      message.success(copy.copySuccess);
    } catch {
      message.error(copy.copyFailed);
    }
  }

  function startEditMessage(messageItem: Message) {
    setEditingMessageId(messageItem.id);
    setEditingContent(messageItem.content);
  }

  function cancelEditMessage() {
    setEditingMessageId(null);
    setEditingContent('');
  }

  function getRetryContent(messageItem: Message): string {
    if (messageItem.role === 'user') return messageItem.content;
    const messageIndex = messages.findIndex((item) => item.id === messageItem.id);
    const earlierMessages = messageIndex >= 0 ? messages.slice(0, messageIndex) : messages;
    return [...earlierMessages].reverse().find((item) => item.role === 'user')?.content ?? messageItem.content;
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
    setSidebarCollapsed(false);
    setViewMode('chat');
    navigate(`/chat/${conversation.id}`);
  }

  function handleOpenResources() {
    message.info(copy.resourcesUnavailable);
  }

  function handleOpenProjects() {
    setSidebarCollapsed(false);
    setViewMode('projects');
    api.listArchivedConversations()
      .then((items) => setArchivedConversations((current) => mergeConversationsById(current, items)))
      .catch(() => setArchivedConversations((current) => current));
  }

  function openConversation(conversation: Conversation) {
    setActiveId(conversation.id);
    setViewMode('chat');
    navigate(`/chat/${conversation.id}`);
  }

  async function archiveConversation(conversation: Conversation, archivedMessages: Message[]) {
    const archivedAt = new Date().toISOString();
    const archivedConversation = { ...conversation, archivedAt };
    archiveConversationSnapshot(archivedConversation, archivedMessages);
    clearDraft(user.id, conversation.id);
    const next = conversations.filter((item) => item.id !== conversation.id);
    setConversations(next);
    setArchivedConversations((current) => [
      archivedConversation,
      ...current.filter((item) => item.id !== conversation.id),
    ]);
    if (conversation.id === activeId) {
      const fallback = next[0];
      setActiveId(fallback?.id);
      setMessages([]);
      navigate(fallback ? `/chat/${fallback.id}` : '/chat', { replace: true });
    }
    message.success(copy.archiveSuccess);
    api.deleteConversation(conversation.id).catch((error) => {
      console.warn('Failed to sync archived conversation with backend', error);
    });
  }

  async function handleDelete(conversation: Conversation) {
    const archivedMessages = conversation.id === activeId ? messages : await api.getMessages(conversation.id);
    if (archivedMessages.length === 0) return;
    await archiveConversation(conversation, archivedMessages);
  }

  function openRename(conversation: Conversation) {
    setRenameTarget(conversation);
    setRenameTitle(conversation.title);
  }

  async function handleRename() {
    if (!renameTarget || renaming) return;
    const title = renameTitle.trim();
    if (!title) {
      message.warning(copy.renameEmpty);
      return;
    }
    try {
      setRenaming(true);
      const updated = await api.updateConversationTitle(renameTarget.id, title);
      setConversations((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setRenameTarget(null);
      setRenameTitle('');
      message.success(copy.renameSuccess);
    } catch {
      message.error(copy.renameFailed);
    } finally {
      setRenaming(false);
    }
  }

  async function handleArchiveCurrent() {
    if (!activeConversation || !canArchiveActiveConversation) return;
    try {
      await archiveConversation(activeConversation, messages);
    } catch {
      message.error(copy.archiveFailed);
    }
  }

  function handleSelectAttachments(files: FileList | null) {
    if (!files?.length) return;
    const nextFiles = Array.from(files);
    const supportedFiles = nextFiles.filter(isSupportedAttachment);
    if (supportedFiles.length !== nextFiles.length) {
      message.warning(copy.unsupportedAttachment);
    }
    if (supportedFiles.length > 0) {
      setAttachments((current) => [...current, ...supportedFiles]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleRemoveAttachment(indexToRemove: number) {
    setAttachments((current) => current.filter((_, index) => index !== indexToRemove));
  }

  function enqueuePrompt(content: string) {
    setPendingPrompts((current) => [...current, content]);
    setDraft('');
  }

  function takeNextPendingPrompt() {
    const [nextPrompt, ...rest] = pendingPromptsRef.current;
    pendingPromptsRef.current = rest;
    setPendingPrompts(rest);
    return nextPrompt;
  }

  function isAbortError(error: unknown): boolean {
    return error instanceof DOMException
      ? error.name === 'AbortError'
      : error instanceof Error && error.name === 'AbortError';
  }

  function handleStopStreaming() {
    streamAbortRef.current?.abort();
    interruptVisibleStreamingMessage();
  }

  async function sendPrompt(content: string, promptAttachments = attachments, replaceAfterMessageId?: string) {
    if (isQuotaExhausted) {
      setUpgradeOpen(true);
      return;
    }

    setStreaming(true);
    const abortController = new AbortController();
    streamAbortRef.current = abortController;
    const clientMessageId = createId('client');
    const submittedConversationId = activeId;
    if (activeId) clearDraft(user.id, activeId);
    setDraft('');
    if (replaceAfterMessageId) {
      setMessages((current) => {
        const replacementIndex = current.findIndex((messageItem) => messageItem.id === replaceAfterMessageId);
        return replacementIndex >= 0 ? current.slice(0, replacementIndex) : current;
      });
    }
    const isStreamStillVisible = (conversationId?: string) => activeIdRef.current === (conversationId ?? submittedConversationId);

    try {
      await api.streamChat(
        {
          conversationId: submittedConversationId,
          content,
          clientMessageId,
          searchMode,
          attachments: promptAttachments,
          replaceAfterMessageId,
          signal: abortController.signal,
        },
        {
          onConversation: (conversation) => {
            setConversations((current) => mergeConversationsById([conversation], current));
            if (!submittedConversationId && isStreamStillVisible()) {
              setActiveId(conversation.id);
              navigate(`/chat/${conversation.id}`, { replace: true });
            }
          },
          onUserMessage: (message) => {
            if (isStreamStillVisible(message.conversationId)) appendMessage(message);
          },
          onAssistantMessage: (message) => {
            if (isStreamStillVisible(message.conversationId)) appendMessage(message);
          },
          onSearch: (results) => {
            if (!isStreamStillVisible()) return;
            setMessages((current) => {
              const latestAssistant = [...current].reverse().find((item) => item.role === 'assistant');
              if (!latestAssistant) return current;
              return current.map((item) => (item.id === latestAssistant.id ? { ...item, searchResults: results } : item));
            });
          },
          onDelta: (message) => {
            if (isStreamStillVisible(message.conversationId)) queueStreamingDelta(message);
          },
          onComplete: (message) => {
            pendingDeltaRef.current = null;
            if (streamFrameRef.current !== null) {
              window.cancelAnimationFrame(streamFrameRef.current);
              streamFrameRef.current = null;
            }
            if (isStreamStillVisible(message.conversationId)) upsertMessage(message);
            setAttachments([]);
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
      if (isAbortError(error)) {
        return;
      }
      message.error('发送失败，请稍后重试');
    } finally {
      if (streamAbortRef.current === abortController) {
        streamAbortRef.current = null;
      }
      const nextPrompt = takeNextPendingPrompt();
      if (nextPrompt) {
        await sendPrompt(nextPrompt, []);
      } else {
        setStreaming(false);
      }
    }
  }

  async function handleSend(contentOverride?: string) {
    const content = (contentOverride ?? draft).trim();
    if (isQuotaExhausted) {
      setUpgradeOpen(true);
      return;
    }
    if (!content) return;
    if (streaming) {
      enqueuePrompt(content);
      return;
    }
    await sendPrompt(content);
  }

  async function handleRetry(messageItem: Message) {
    await handleSend(getRetryContent(messageItem) || '继续完成上一次回答');
  }

  async function handleSendEditedMessage(messageItem: Message) {
    const content = editingContent.trim();
    if (!content) {
      message.warning(copy.editEmpty);
      return;
    }
    if (streaming) return;
    setPendingPrompts([]);
    pendingPromptsRef.current = [];
    setEditingMessageId(null);
    setEditingContent('');
    await sendPrompt(content, [], messageItem.id);
  }

  async function handleLogout() {
    await api.logout();
    onLogout();
    navigate('/login', { replace: true });
  }

  function renderComposer(compact = false) {
    return (
      <div className={`${styles.composer} ${compact ? styles.heroComposer : ''}`}>
        {quota && shouldShowQuota && !compact && (
          <div className={styles.quotaNotice}>
            <span>{copy.quota}</span>
            <strong>{quota.remainingMessages}</strong>
            <small>{copy.used} {quota.usedMessages} / {quota.grantedMessages}</small>
          </div>
        )}
        {pendingPrompts.length > 0 && (
          <div className={styles.pendingQueue} aria-label={copy.waitingToSend}>
            <span>{copy.waitingToSend}</span>
            {pendingPrompts.map((prompt, index) => (
              <div className={styles.pendingPrompt} key={`${prompt}-${index}`}>
                {prompt}
              </div>
            ))}
          </div>
        )}
        <div className={styles.composerInputWrap}>
          <Input.TextArea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            onPressEnter={(event) => {
              if (!event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            autoSize={{ minRows: compact ? 2 : 1, maxRows: 5 }}
            placeholder={copy.placeholder}
            aria-label={copy.placeholder}
          />
          {!draft && !composerFocused && (
            <span className={styles.animatedPlaceholder} aria-hidden="true">
              {animatedPlaceholder}
            </span>
          )}
        </div>
        <input
          ref={fileInputRef}
          aria-label={copy.chooseAttachment}
          className={styles.fileInput}
          type="file"
          accept={attachmentAccept}
          multiple
          onChange={(event) => handleSelectAttachments(event.target.files)}
        />
        {attachments.length > 0 && (
          <div className={styles.attachmentList}>
            {attachments.map((file, index) => (
              <span className={styles.attachmentChip} key={`${file.name}-${file.size}-${index}`}>
                <PaperClipOutlined />
                <span>{file.name}</span>
                <button type="button" onClick={() => handleRemoveAttachment(index)} aria-label={`${copy.removeAttachment} ${file.name}`}>
                  <CloseOutlined />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className={styles.composerActions}>
          <div className={styles.actionCluster}>
            <Tooltip title={copy.attachFile}>
              <button className={styles.roundAction} type="button" onClick={() => fileInputRef.current?.click()} aria-label={copy.attachFile}>
                <PaperClipOutlined />
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
            {streaming ? (
              <Tooltip title={copy.stopGenerating}>
                <button className={styles.stopButton} type="button" onClick={handleStopStreaming} aria-label={copy.stopGenerating}>
                  <span aria-hidden="true" />
                </button>
              </Tooltip>
            ) : (
              <Button
                type="primary"
                shape="circle"
                size="large"
                icon={compact ? <ArrowUpOutlined /> : <SendOutlined />}
                onClick={() => handleSend()}
                aria-label="send"
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className={`${styles.shell} ${theme === 'dark' ? styles.dark : styles.light} ${sidebarCollapsed ? styles.shellCollapsed : ''}`}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.brand}>
            <div className={styles.brandMark}>A</div>
            <div className={styles.logo}>Atoms</div>
          </div>
          <Tooltip title={copy.hideSidebar}>
            <button className={styles.sidebarToggle} type="button" onClick={() => setSidebarCollapsed(true)} aria-label={copy.hideSidebar}>
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
        <button className={styles.navItem} type="button" onClick={handleOpenResources}>
          <CompassOutlined />
          <span>{copy.resources}</span>
        </button>
        <button className={`${styles.navItem} ${styles.navItemActive}`} type="button" onClick={handleOpenProjects}>
          <HomeOutlined />
          <span>{copy.projects}</span>
        </button>

        <div className={styles.sectionTitle}>Recents</div>
        <div className={styles.conversationList} ref={conversationListRef}>
          {conversations.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无会话" />
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`${styles.conversationItem} ${conversation.id === activeId ? styles.active : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  openConversation(conversation);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openConversation(conversation);
                  }
                }}
              >
                <span>{conversation.title}</span>
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      {
                        key: 'rename',
                        label: copy.renameConversation,
                      },
                      ...((conversation.id !== activeId || canArchiveActiveConversation) ? [{
                        key: 'archive',
                        label: copy.archiveCurrent,
                        danger: true,
                      }] : []),
                    ],
                    onClick: ({ key, domEvent }) => {
                      domEvent.stopPropagation();
                      if (key === 'rename') {
                        openRename(conversation);
                      }
                      if (key === 'archive') {
                        handleDelete(conversation).catch(() => message.error(copy.archiveFailed));
                      }
                    },
                  }}
                >
                  <button
                    className={styles.conversationMenu}
                    type="button"
                    aria-label={copy.conversationActions}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MoreOutlined />
                  </button>
                </Dropdown>
              </div>
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
            <button className={styles.dockIcon} type="button" onClick={handleOpenProjects} aria-label={copy.projects}><HomeOutlined /></button>
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
          <div className={styles.conversationHeader}>
            {sidebarCollapsed && (
              <Tooltip title={copy.showSidebar}>
                <button className={styles.sidebarRestore} type="button" onClick={() => setSidebarCollapsed(false)} aria-label={copy.showSidebar}>
                  <AppstoreOutlined />
                </button>
              </Tooltip>
            )}
            <strong>{viewMode === 'projects' ? copy.projectsTitle : activeConversation?.title ?? copy.titleFallback}</strong>
            {canArchiveActiveConversation && (
              <Tooltip title={copy.archiveCurrent}>
                <button
                  className={styles.iconButton}
                  type="button"
                  onClick={handleArchiveCurrent}
                  aria-label={copy.archiveCurrent}
                >
                  <CalendarOutlined />
                </button>
              </Tooltip>
            )}
          </div>
          <Space>
            {quota && shouldShowQuota && <Tag color={quota.remainingMessages > 0 ? 'success' : 'warning'}>{copy.quota} {quota.remainingMessages}</Tag>}
            <Tag icon={<WifiOutlined />} color="default">
              {runtime.providerLabel}
            </Tag>
            <Tag color={navigator.onLine ? 'success' : 'warning'}>{navigator.onLine ? 'Online' : 'Offline'}</Tag>
          </Space>
        </header>

        {viewMode === 'projects' ? (
          <div className={`${styles.messagePanel} ${styles.projectsPanel}`}>
            <section className={styles.projectsHeader}>
              <div>
                <span>{copy.projects}</span>
                <h2>{copy.projectsTitle}</h2>
                <p>{copy.projectsSubtitle}</p>
              </div>
              <Tag>{archivedConversations.length} {copy.archivedCount}</Tag>
            </section>
            {archivedConversations.length === 0 ? (
              <div className={styles.projectsEmpty}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={copy.noArchivedTitle} />
                <p>{copy.noArchivedDescription}</p>
              </div>
            ) : (
              <div className={styles.archivedGrid}>
                {archivedConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    className={styles.archivedCard}
                    type="button"
                    onClick={() => openConversation(conversation)}
                    aria-label={`${copy.openArchived} ${conversation.title}`}
                  >
                    <span>{copy.archivedOn} {new Date(conversation.archivedAt ?? conversation.updatedAt).toLocaleDateString()}</span>
                    <strong>{conversation.title}</strong>
                    <small>{new Date(conversation.updatedAt).toLocaleString()}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
        <div className={styles.messagePanel}>
          {messagesLoading ? (
            <div className={styles.messageLoading} aria-label={language === 'zh' ? '正在加载对话' : 'Loading conversation'}>
              <span>{language === 'zh' ? '正在加载对话...' : 'Loading conversation...'}</span>
            </div>
          ) : messages.length === 0 ? (
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
                {editingMessageId === item.id ? (
                  <div className={styles.messageEditor}>
                    <Input.TextArea
                      value={editingContent}
                      autoFocus
                      autoSize={{ minRows: 2, maxRows: 8 }}
                      onChange={(event) => setEditingContent(event.target.value)}
                      onPressEnter={(event) => {
                        if (!event.shiftKey) {
                          event.preventDefault();
                          handleSendEditedMessage(item);
                        }
                      }}
                      aria-label={copy.editMessage}
                    />
                    <div className={styles.messageEditorActions}>
                      <Button onClick={cancelEditMessage}>{copy.cancelEdit}</Button>
                      <Button
                        type="primary"
                        icon={<SendOutlined />}
                        loading={streaming}
                        disabled={streaming}
                        onClick={() => handleSendEditedMessage(item)}
                        aria-label={copy.sendEdit}
                      >
                        {copy.sendEdit}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.messageContent}>
                    {item.content || (
                      item.status === 'streaming'
                        ? (
                            <span className={styles.generatingText}>
                              {language === 'zh' ? '对话生成中' : 'Generating response'}
                              <span className={styles.typingCursor} aria-hidden="true" />
                            </span>
                          )
                        : ''
                    )}
                  </div>
                )}
                {item.role === 'user' && item.status !== 'streaming' && editingMessageId !== item.id && (
                  <div className={styles.messageActions}>
                    <Tooltip title={copy.copyMessage}>
                      <button className={styles.messageAction} type="button" aria-label={copy.copyMessage} onClick={() => handleCopyMessage(item.content)}>
                        <CopyOutlined />
                      </button>
                    </Tooltip>
                    <Tooltip title={copy.editMessage}>
                      <button className={styles.messageAction} type="button" aria-label={copy.editMessage} disabled={streaming} onClick={() => startEditMessage(item)}>
                        <EditOutlined />
                      </button>
                    </Tooltip>
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
        )}

        {viewMode === 'chat' && !messagesLoading && messages.length > 0 && !activeConversation?.archivedAt && <footer>{renderComposer()}</footer>}

        {viewMode === 'chat' && !messagesLoading && messages.length === 0 && (
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
        title={copy.renameTitle}
        open={Boolean(renameTarget)}
        okText={copy.renameConversation}
        cancelText={language === 'zh' ? '取消' : 'Cancel'}
        confirmLoading={renaming}
        onOk={handleRename}
        onCancel={() => {
          setRenameTarget(null);
          setRenameTitle('');
        }}
      >
        <Input
          value={renameTitle}
          placeholder={copy.renamePlaceholder}
          maxLength={200}
          showCount
          autoFocus
          onChange={(event) => setRenameTitle(event.target.value)}
          onPressEnter={handleRename}
        />
      </Modal>

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
