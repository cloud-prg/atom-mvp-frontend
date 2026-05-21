import { Button, Input, Segmented, Typography, message } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, CheckCircleFilled, GithubOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, runtime } from '../api/client';
import type { User } from '../types/domain';
import styles from './LoginPage.module.css';

interface LoginPageProps {
  onLogin: (user: User) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'admin' | 'email'>('admin');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = mode === 'admin'
    ? username.trim().length > 0 && password.length > 0
    : isGmailAddress(email) && verificationCode.length === 6;

  useEffect(() => {
    if (codeCooldown <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setCodeCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [codeCooldown]);

  function handleGithubLogin() {
    window.location.href = runtime.githubLoginUrl;
  }

  function isGmailAddress(value: string) {
    return /^[^\s@]+@gmail\.com$/i.test(value.trim());
  }

  async function handleSubmit() {
    if (mode === 'admin') {
      setSubmitting(true);
      try {
        const result = await api.adminLogin(username, password);
        onLogin(result.user);
        message.success('登录成功');
        navigate('/chat', { replace: true });
      } catch {
        message.error('账号或密码错误');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!isGmailAddress(email)) {
      message.warning('请输入 Gmail 邮箱');
      return;
    }
    if (verificationCode.length !== 6) {
      message.warning('请输入 6 位邮箱验证码');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.login(email, verificationCode);
      onLogin(result.user);
      message.success('登录成功');
      navigate('/chat', { replace: true });
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      if (detail.includes('Invalid or expired verification code')) {
        message.error('验证码错误或已过期');
      } else if (detail.includes('Only @gmail.com')) {
        message.error('目前只支持 Gmail 邮箱');
      } else if (detail.includes('Only @163.com')) {
        message.error('目前只支持 163 邮箱测试');
      } else if (detail.includes('Email account is not registered')) {
        message.error('该邮箱暂未开通账号，请联系管理员');
      } else {
        message.error('登录失败，请稍后重试');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendCode() {
    if (codeCooldown > 0) {
      return;
    }
    if (!isGmailAddress(email)) {
      message.warning('请先输入 Gmail 邮箱');
      return;
    }
    setSendingCode(true);
    try {
      await api.requestEmailVerification(email);
      setCodeCooldown(60);
      message.success('验证码已发送，请查收 Gmail');
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      if (detail.includes('You can only send testing emails')) {
        message.error('Resend 测试模式只能发给账号邮箱，请先在 Resend 验证发信域名或改用账号邮箱测试');
      } else if (detail.includes('Email provider request failed')) {
        message.error('邮件服务发送失败，请检查 Resend API Key 或发件地址配置');
      } else {
        message.error('验证码发送失败，请稍后重试');
      }
    } finally {
      setSendingCode(false);
    }
  }

  return (
    <main className={styles.page}>
      <button className={styles.backButton} type="button" aria-label="返回">
        <ArrowLeftOutlined />
      </button>

      <section className={styles.loginColumn}>
        <div className={styles.panel}>
          <Typography.Title className={styles.title}>Log in or sign up</Typography.Title>
          <Typography.Paragraph className={styles.subtitle}>Start creating with Atoms</Typography.Paragraph>

          <Button className={styles.googleButton} icon={<GithubOutlined />} block onClick={handleGithubLogin}>
            Continue with GitHub
          </Button>

          <div className={styles.divider}>
            <span />
            <em>Or</em>
            <span />
          </div>

          <div className={styles.form}>
            <Segmented
              block
              value={mode}
              onChange={(value) => setMode(value as 'admin' | 'email')}
              options={[
                { label: '账号密码', value: 'admin' },
                { label: '邮箱验证码', value: 'email' },
              ]}
            />

            {mode === 'admin' ? (
              <>
                <label className={styles.label}>
                  账号
                  <Input size="large" value={username} onChange={(event) => setUsername(event.target.value)} onPressEnter={handleSubmit} />
                </label>
                <label className={styles.label}>
                  密码
                  <Input.Password size="large" value={password} onChange={(event) => setPassword(event.target.value)} onPressEnter={handleSubmit} />
                </label>
              </>
            ) : (
              <>
                <label className={styles.label}>
                  邮箱
                  <Input size="large" placeholder="Enter your Gmail address" value={email} onChange={(event) => setEmail(event.target.value)} />
                </label>
                <label className={styles.label}>
                  邮箱验证码
                  <div className={styles.codeRow}>
                    <Input
                      size="large"
                      placeholder="6 位验证码"
                      value={verificationCode}
                      maxLength={6}
                      onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ''))}
                      onPressEnter={handleSubmit}
                    />
                    <Button size="large" loading={sendingCode} disabled={codeCooldown > 0} onClick={handleSendCode}>
                      {codeCooldown > 0 ? `${codeCooldown}s` : '发送验证码'}
                    </Button>
                  </div>
                </label>
              </>
            )}

            <Button
              type="primary"
              size="large"
              block
              icon={<ArrowRightOutlined />}
              loading={submitting}
              disabled={!canSubmit}
              onClick={handleSubmit}
              aria-label="Continue login"
            >
              Continue
            </Button>
          </div>
        </div>
      </section>

      <aside className={styles.visualColumn} aria-hidden="true">
        <div className={styles.heroCard}>
          <div className={styles.visualBrand}>
            <span className={styles.brandMark}>A</span>
            <strong>Atoms</strong>
          </div>
          <h2>Turn ideas into products that sell</h2>
          <ul>
            {[
              'Minutes instead of weeks',
              'Real apps, not just demos',
              'Automate your operations',
              'Get paying customers and revenue',
              'Stay fully in control',
            ].map((item) => (
              <li key={item}>
                <CheckCircleFilled />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <svg className={styles.mascotLeft} viewBox="0 0 180 180" role="img">
            <defs>
              <linearGradient id="mascotWarm" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#fff7eb" />
                <stop offset="100%" stopColor="#ffd5b4" />
              </linearGradient>
            </defs>
            <circle cx="80" cy="92" r="58" fill="url(#mascotWarm)" />
            <path d="M35 72c11-31 51-47 83-29 8 4 14 10 20 17-21-9-58-6-103 12Z" fill="#ff8d34" />
            <path d="M62 36c18-15 46-10 59 9-18-7-38-6-59-1Z" fill="#ff9f42" />
            <circle cx="62" cy="88" r="8" fill="#151515" />
            <circle cx="101" cy="88" r="8" fill="#151515" />
            <path d="M72 114c18 13 35 10 45-5" fill="none" stroke="#151515" strokeLinecap="round" strokeWidth="7" />
            <path d="M86 122l24 26 5-45Z" fill="#f15f2a" />
            <path d="M28 118c-18 17-29 21-41 14" fill="none" stroke="#ffd2ab" strokeLinecap="round" strokeWidth="18" />
            <path d="M128 113c24 6 35 15 42 30" fill="none" stroke="#ffd2ab" strokeLinecap="round" strokeWidth="18" />
          </svg>
          <svg className={styles.mascotRight} viewBox="0 0 180 180" role="img">
            <defs>
              <linearGradient id="mascotCool" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#d8f4ff" />
                <stop offset="100%" stopColor="#79b8ff" />
              </linearGradient>
            </defs>
            <circle cx="96" cy="96" r="56" fill="url(#mascotCool)" />
            <circle cx="76" cy="82" r="20" fill="none" stroke="#3267c8" strokeWidth="5" />
            <circle cx="118" cy="82" r="20" fill="none" stroke="#3267c8" strokeWidth="5" />
            <path d="M96 82h2" stroke="#3267c8" strokeLinecap="round" strokeWidth="5" />
            <circle cx="76" cy="83" r="5" fill="#162b50" />
            <circle cx="118" cy="83" r="5" fill="#162b50" />
            <path d="M84 112c13 10 28 9 38-2" fill="none" stroke="#162b50" strokeLinecap="round" strokeWidth="6" />
            <path d="M41 107c-18 3-29 13-33 30" fill="none" stroke="#a9dcff" strokeLinecap="round" strokeWidth="17" />
          </svg>
        </div>
        <div className={styles.trustBlock}>
          <p>Trusted by customers from</p>
          <div className={styles.logoCloud}>
            {['amazon', 'Walmart', 'ebay', 'SAMSUNG', 'Lenovo', 'Microsoft', 'MAERSK', 'orange', 'mercado libre', 'Deutsche Bank', 'NVIDIA'].map((logo) => (
              <span key={logo}>{logo}</span>
            ))}
          </div>
        </div>
      </aside>
    </main>
  );
}
