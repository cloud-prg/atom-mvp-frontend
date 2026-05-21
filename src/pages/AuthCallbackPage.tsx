import { Alert, Spin } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { ApiRequestError, writeApiToken } from '../api/realApi';
import type { User } from '../types/domain';

interface AuthCallbackPageProps {
  onLogin: (user: User) => void;
}

export default function AuthCallbackPage({ onLogin }: AuthCallbackPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function finishLogin() {
      const token = searchParams.get('token');
      if (!token) {
        setError('GitHub 登录回调缺少 token，请重新登录。');
        return;
      }

      writeApiToken(token);
      const user = await api.me();
      if (!user) {
        writeApiToken(null);
        setError('登录态验证失败：后端 /api/auth/me 没有返回当前用户。');
        return;
      }

      onLogin(user);
      navigate('/chat', { replace: true });
    }

    finishLogin().catch((error) => {
      writeApiToken(null);
      if (error instanceof ApiRequestError) {
        setError(`登录态验证失败：后端 /api/auth/me 返回 ${error.status ?? '未知状态'}。请确认 OAuth token 未过期且后端接受 Bearer token。`);
        return;
      }
      setError('GitHub 登录失败：无法连接后端或返回格式不符合前端预期。');
    });
  }, [navigate, onLogin, searchParams]);

  if (error) {
    return (
      <main className="boot-screen">
        <Alert type="error" message={error} showIcon />
      </main>
    );
  }

  return (
    <main className="boot-screen">
      <Spin />
      <span>正在完成 GitHub 登录...</span>
    </main>
  );
}
