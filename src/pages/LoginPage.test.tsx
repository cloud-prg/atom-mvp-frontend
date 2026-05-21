import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import LoginPage from './LoginPage';

describe('LoginPage', () => {
  it('renders production auth form', () => {
    render(
      <MemoryRouter>
        <LoginPage onLogin={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Log in or sign up')).toBeInTheDocument();
    expect(screen.getByText('Continue with GitHub')).toBeInTheDocument();
    expect(screen.queryByText(/邮箱验证码仅用于已开通账号/)).not.toBeInTheDocument();
    expect(screen.getByText('账号密码')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('admin')).toHaveLength(2);
    expect(screen.queryByPlaceholderText('cloud_prg@163.com')).not.toBeInTheDocument();
    expect(screen.getByText('Turn ideas into products that sell')).toBeInTheDocument();
    expect(screen.queryByText('一键进入 Demo 工作台')).not.toBeInTheDocument();
  });

  it('disables continue until Gmail, slide captcha, and verification code are filled', () => {
    render(
      <MemoryRouter>
        <LoginPage onLogin={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('邮箱验证码'));

    expect(screen.getByRole('button', { name: 'Continue login' })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Enter your Gmail address'), {
      target: { value: 'user@gmail.com' },
    });
    expect(screen.getByRole('button', { name: 'Continue login' })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('6 位验证码'), {
      target: { value: '123456' },
    });
    expect(screen.getByRole('button', { name: 'Continue login' })).toBeDisabled();

    fireEvent.keyDown(screen.getByRole('slider', { name: '拖动完成滑动拼图验证' }), {
      key: 'End',
    });
    expect(screen.getByRole('button', { name: 'Continue login' })).toBeEnabled();
  });

  it('requires slide captcha before sending an email code', () => {
    render(
      <MemoryRouter>
        <LoginPage onLogin={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('邮箱验证码'));
    fireEvent.change(screen.getByPlaceholderText('Enter your Gmail address'), {
      target: { value: 'user@gmail.com' },
    });

    expect(screen.getByRole('button', { name: '发送验证码' })).toBeDisabled();

    fireEvent.keyDown(screen.getByRole('slider', { name: '拖动完成滑动拼图验证' }), {
      key: 'End',
    });

    expect(screen.getByRole('button', { name: '发送验证码' })).toBeEnabled();
  });
});
