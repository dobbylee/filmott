import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AUTH_REQUIRED_EVENT } from '@/lib/constants';
import type { ReactNode } from 'react';
import type { User } from '@/types/auth';

const mockPost = vi.fn();

vi.mock('@/lib/api', () => ({
  default: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

const mockUser: User = {
  id: 1,
  nickname: 'testuser',
  email: 'test@example.com',
};

const mockAuthResponse = {
  data: {
    access_token: 'mock-token-abc',
    user: mockUser,
  },
};

// localStorage mock
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get _store() {
      return store;
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Helper component to consume and display auth context
function AuthConsumer() {
  const { user, token, isLoading, authModal, login, signup, logout, openAuthModal, closeAuthModal } = useAuth();

  return (
    <div>
      <div data-testid="user">{user ? user.nickname : 'null'}</div>
      <div data-testid="token">{token ?? 'null'}</div>
      <div data-testid="isLoading">{isLoading ? 'true' : 'false'}</div>
      <div data-testid="modalOpen">{authModal.isOpen ? 'true' : 'false'}</div>
      <div data-testid="modalMode">{authModal.mode}</div>
      <button onClick={() => login({ email: 'test@example.com', password: 'password' })}>
        login
      </button>
      <button onClick={() => signup({ email: 'test@example.com', nickname: 'testuser', password: 'password' })}>
        signup
      </button>
      <button onClick={logout}>logout</button>
      <button onClick={() => openAuthModal('login')}>openLoginModal</button>
      <button onClick={() => openAuthModal('signup')}>openSignupModal</button>
      <button onClick={closeAuthModal}>closeModal</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  describe('useAuth', () => {
    it('AuthProvider 외부에서 사용 시 에러를 던져야 한다', () => {
      // Suppress React error boundary console.error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      function BadComponent() {
        useAuth();
        return null;
      }

      expect(() => render(<BadComponent />)).toThrow(
        'useAuth must be used within an AuthProvider'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('AuthProvider 초기 상태', () => {
    it('마운트 후 user가 null이고 isLoading이 false여야 한다', async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
      });
      expect(screen.getByTestId('user')).toHaveTextContent('null');
      expect(screen.getByTestId('token')).toHaveTextContent('null');
    });

    it('localStorage에서 user와 token을 복원해야 한다', async () => {
      localStorageMock.setItem('access_token', 'stored-token');
      localStorageMock.setItem('user', JSON.stringify(mockUser));

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
      });
      expect(screen.getByTestId('user')).toHaveTextContent('testuser');
      expect(screen.getByTestId('token')).toHaveTextContent('stored-token');
    });

    it('localStorage의 손상된 user JSON을 처리해야 한다', async () => {
      localStorageMock.setItem('access_token', 'stored-token');
      localStorageMock.setItem('user', 'invalid-json');

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
      });
      expect(screen.getByTestId('user')).toHaveTextContent('null');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('user');
    });
  });

  describe('login', () => {
    it('API를 호출하고, user/token을 설정하고, localStorage에 저장해야 한다', async () => {
      mockPost.mockResolvedValue(mockAuthResponse);
      const user = userEvent.setup();

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
      });

      await user.click(screen.getByRole('button', { name: 'login' }));

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('testuser');
      });

      expect(mockPost).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password',
      });
      expect(screen.getByTestId('token')).toHaveTextContent('mock-token-abc');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('access_token', 'mock-token-abc');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('user', JSON.stringify(mockUser));
    });
  });

  describe('signup', () => {
    it('API를 호출하고, user/token을 설정하고, localStorage에 저장해야 한다', async () => {
      mockPost.mockResolvedValue(mockAuthResponse);
      const user = userEvent.setup();

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
      });

      await user.click(screen.getByRole('button', { name: 'signup' }));

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('testuser');
      });

      expect(mockPost).toHaveBeenCalledWith('/auth/signup', {
        email: 'test@example.com',
        nickname: 'testuser',
        password: 'password',
      });
      expect(screen.getByTestId('token')).toHaveTextContent('mock-token-abc');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('access_token', 'mock-token-abc');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('user', JSON.stringify(mockUser));
    });
  });

  describe('logout', () => {
    it('user/token을 초기화하고 localStorage에서 제거해야 한다', async () => {
      mockPost.mockResolvedValue(mockAuthResponse);
      const user = userEvent.setup();

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
      });

      // Login first
      await user.click(screen.getByRole('button', { name: 'login' }));
      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('testuser');
      });

      // Then logout
      await user.click(screen.getByRole('button', { name: 'logout' }));

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('null');
      });
      expect(screen.getByTestId('token')).toHaveTextContent('null');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('access_token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('user');
    });
  });

  describe('authModal', () => {
    it('기본적으로 login 모드로 모달을 열어야 한다', async () => {
      const user = userEvent.setup();

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      expect(screen.getByTestId('modalOpen')).toHaveTextContent('false');

      await user.click(screen.getByText('openLoginModal'));

      expect(screen.getByTestId('modalOpen')).toHaveTextContent('true');
      expect(screen.getByTestId('modalMode')).toHaveTextContent('login');
    });

    it('signup 모드로 모달을 열어야 한다', async () => {
      const user = userEvent.setup();

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await user.click(screen.getByText('openSignupModal'));

      expect(screen.getByTestId('modalOpen')).toHaveTextContent('true');
      expect(screen.getByTestId('modalMode')).toHaveTextContent('signup');
    });

    it('모달을 닫고 모드를 유지해야 한다', async () => {
      const user = userEvent.setup();

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await user.click(screen.getByText('openSignupModal'));
      expect(screen.getByTestId('modalOpen')).toHaveTextContent('true');

      await user.click(screen.getByText('closeModal'));

      expect(screen.getByTestId('modalOpen')).toHaveTextContent('false');
      // mode is preserved after close (prev => ({ ...prev, isOpen: false }))
      expect(screen.getByTestId('modalMode')).toHaveTextContent('signup');
    });
  });

  describe('auth:required 이벤트', () => {
    it('auth:required 이벤트 발생 시 로그인 모달을 열고 사용자를 초기화해야 한다', async () => {
      // Start with a logged in user
      localStorageMock.setItem('access_token', 'stored-token');
      localStorageMock.setItem('user', JSON.stringify(mockUser));

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('testuser');
      });

      // Dispatch auth:required event
      act(() => {
        window.dispatchEvent(new CustomEvent('auth:required'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('null');
      });
      expect(screen.getByTestId('token')).toHaveTextContent('null');
      expect(screen.getByTestId('modalOpen')).toHaveTextContent('true');
      expect(screen.getByTestId('modalMode')).toHaveTextContent('login');
    });

    it('이벤트 리스닝에 AUTH_REQUIRED_EVENT 상수를 사용해야 한다', () => {
      expect(AUTH_REQUIRED_EVENT).toBe('auth:required');

      const addSpy = vi.spyOn(window, 'addEventListener');

      function hookWrapper({ children }: { children: ReactNode }) {
        return <AuthProvider>{children}</AuthProvider>;
      }
      renderHook(() => useAuth(), { wrapper: hookWrapper });

      const authRequiredCalls = addSpy.mock.calls.filter(
        ([event]) => event === AUTH_REQUIRED_EVENT,
      );
      expect(authRequiredCalls.length).toBeGreaterThan(0);

      addSpy.mockRestore();
    });
  });
});
