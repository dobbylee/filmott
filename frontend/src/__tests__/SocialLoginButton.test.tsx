import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SocialLoginButton from '@/components/auth/SocialLoginButton';

const mockTrackEvent = vi.fn();
vi.mock('@/lib/ga', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

describe('SocialLoginButton', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  it('google 버튼을 렌더링해야 한다', () => {
    render(<SocialLoginButton provider="google" />);
    expect(screen.getByText('Google로 계속하기')).toBeInTheDocument();
  });

  it('kakao 버튼을 렌더링해야 한다', () => {
    render(<SocialLoginButton provider="kakao" />);
    expect(screen.getByText('카카오로 계속하기')).toBeInTheDocument();
  });

  it('naver 버튼을 렌더링해야 한다', () => {
    render(<SocialLoginButton provider="naver" />);
    expect(screen.getByText('네이버로 계속하기')).toBeInTheDocument();
  });

  it.each([
    { provider: 'google' as const, label: 'Google로 계속하기' },
    { provider: 'kakao' as const, label: '카카오로 계속하기' },
    { provider: 'naver' as const, label: '네이버로 계속하기' },
  ])('$provider 버튼 클릭 시 social_login_started 이벤트를 호출해야 한다', async ({ provider, label }) => {
    const user = userEvent.setup();
    render(<SocialLoginButton provider={provider} />);

    await user.click(screen.getByText(label));

    expect(mockTrackEvent).toHaveBeenCalledWith('social_login_started', { provider });
  });

  it('클릭 시 trackEvent는 리디렉션보다 먼저 호출되어야 한다', async () => {
    const callOrder: string[] = [];
    mockTrackEvent.mockImplementation(() => callOrder.push('trackEvent'));
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        get href() { return ''; },
        set href(_v: string) { callOrder.push('redirect'); },
      },
    });

    const user = userEvent.setup();
    render(<SocialLoginButton provider="google" />);
    await user.click(screen.getByText('Google로 계속하기'));

    expect(callOrder[0]).toBe('trackEvent');
    expect(callOrder[1]).toBe('redirect');
  });

  it('클릭 시 auth 엔드포인트로 리디렉션해야 한다', async () => {
    const user = userEvent.setup();
    render(<SocialLoginButton provider="google" />);

    await user.click(screen.getByText('Google로 계속하기'));

    expect(window.location.href).toContain('/auth/google');
  });

  it('data-testid 속성이 올바르게 설정되어야 한다', () => {
    render(<SocialLoginButton provider="kakao" />);
    expect(screen.getByTestId('social-login-kakao')).toBeInTheDocument();
  });
});
