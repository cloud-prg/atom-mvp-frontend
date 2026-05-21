import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '../types/domain';
import AuthCallbackPage from './AuthCallbackPage';

const mockUser: User = {
  id: 'user-1',
  email: 'octo@example.com',
  nickname: 'Octo',
  createdAt: '2026-05-21T00:00:00Z',
};

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  writeApiToken: vi.fn(),
}));

vi.mock('../api/client', () => ({
  api: {
    me: mocks.me,
  },
}));

vi.mock('../api/realApi', () => ({
  writeApiToken: mocks.writeApiToken,
}));

describe('AuthCallbackPage', () => {
  it('stores OAuth token, loads current user, and finishes login', async () => {
    mocks.me.mockResolvedValue(mockUser);
    const onLogin = vi.fn();

    render(
      <MemoryRouter initialEntries={['/auth/callback?token=session-token&user_id=user-1']}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage onLogin={onLogin} />} />
          <Route path="/chat" element={<div>Chat</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(mocks.writeApiToken).toHaveBeenCalledWith('session-token'));
    expect(mocks.me).toHaveBeenCalled();
    expect(onLogin).toHaveBeenCalledWith(mockUser);
  });
});
