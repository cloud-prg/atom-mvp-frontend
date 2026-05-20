import { Button, Input, Typography, message } from 'antd';
import { ArrowRightOutlined, GoogleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api } from '../api/client';
import type { User } from '../types/domain';
import styles from './LoginPage.module.css';

interface LoginPageProps {
  onLogin: (user: User) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');

  async function handleSubmit() {
    if (!email.includes('@') || !nickname.trim()) {
      message.warning('请输入邮箱和昵称');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.login(email, nickname);
      onLogin(result.user);
      message.success('已进入 Demo 工作台');
      navigate('/chat', { replace: true });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDemoLogin() {
    setEmail('demo@example.com');
    setNickname('Demo');
    setSubmitting(true);
    try {
      const result = await api.login('demo@example.com', 'Demo');
      onLogin(result.user);
      navigate('/chat', { replace: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.brand}>Atom MVP</div>
        <Typography.Title className={styles.title}>把想法变成可演示的 AI 工作台</Typography.Title>
        <Typography.Paragraph className={styles.subtitle}>
          使用 Demo 登录进入最小 MVP。无需真实密钥，也能演示会话、流式回复、搜索引用和刷新恢复。
        </Typography.Paragraph>

        <Button className={styles.googleButton} icon={<GoogleOutlined />} block>
          使用 Google 继续
        </Button>
        <Button className={styles.demoButton} block onClick={handleDemoLogin}>
          一键进入 Demo 工作台
        </Button>

        <div className={styles.divider}>或使用 Demo 登录</div>

        <div className={styles.form}>
          <label className={styles.label}>
            邮箱
            <Input size="large" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className={styles.label}>
            昵称
            <Input size="large" placeholder="你的名字" value={nickname} onChange={(event) => setNickname(event.target.value)} />
          </label>
          <Button
            type="primary"
            size="large"
            block
            icon={<ArrowRightOutlined />}
            loading={submitting}
            onClick={handleSubmit}
          >
            继续
          </Button>
        </div>
      </section>
    </main>
  );
}
