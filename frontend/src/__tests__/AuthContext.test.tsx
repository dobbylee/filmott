import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AUTH_REQUIRED_EVENT } from '@/lib/constants';
import type { ReactNode } from 'react';
import type { User } from '@/types/auth';

const mockRefreshGet = vi.fn();
const mockRefreshPost = vi.fn();

vi.mock('@/lib/api', () => ({
  default: {},
  refreshApi: {
    get: (...args: unknown[]) => mockRefreshGet(...args),
    post: (...args: unknown[]) => mockRefreshPost(...args),
  },
}));

const mockUser: User = {
  id: 1,
  nickname: 'testuser',
  email: 'test@example.com',
};

const mockAuthResponse = {
  user: mockUser,
};

const createAxiosError = (status: number) => ({
  isAxiosError: true,
  response: { status },
});

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

function AuthConsumer() {
  const {
    user,
    token,
    isLoading,
    authModal,
    handleAuthSuccess,
    logout,
    openAuthModal,
    closeAuthModal,
  } = useAuth();

  return (
    <div>
      <div data-testid="user">{user ? user.nickname : 'null'}</div>
      <div data-testid="token">{token ?? 'null'}</div>
      <div data-testid="isLoading">{isLoading ? 'true' : 'false'}</div>
      <div data-testid="modalOpen">{authModal.isOpen ? 'true' : 'false'}</div>
      <button onClick={() => handleAuthSuccess(mockAuthResponse)}>handleAuthSuccess</button>
      <button onClick={logout}>logout</button>
      <button onClick={() => openAuthModal()}>openModal</button>
      <button onClick={closeAuthModal}>closeModal</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockRefreshGet.mockReset();
    mockRefreshPost.mockReset();
  });

  describe('useAuth', () => {
    it('AuthProvider 외부에서 사용 시 에러를 던져야 한다', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      function BadComponent() {
        useAuth();
        return null;
      }

      expect(() => render(<BadComponent />)).toThrow('useAuth must be used within an AuthProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('AuthProvider 초기 상태', () => {
    it('세션이 없으면 user가 null이고 isLoading이 false여야 한다', async () => {
      mockRefreshGet.mockRejectedValueOnce(createAxiosError(401));
      mockRefreshPost.mockRejectedValueOnce(createAxiosError(401));

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
      });
      expect(screen.getByTestId('user')).toHaveTextContent('null');
      expect(screen.getByTestId('token')).toHaveTextContent('null');
    });

    it('/users/me 응답으로 세션을 복원해야 한다', async () => {
      localStorageMock.setItem('access_token', 'legacy-token');
      localStorageMock.setItem('user', JSON.stringify({ nickname: 'legacy' }));
      mockRefreshGet.mockResolvedValueOnce({ data: mockUser });

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('testuser');
      });

      expect(mockRefreshGet).toHaveBeenCalledWith('/users/me');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('access_token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('user');
    });

    it('/users/me가 401이면 refresh 후 재조회해야 한다', async () => {
      mockRefreshGet.mockRejectedValueOnce(createAxiosError(401)).mockResolvedValueOnce({
        data: mockUser,
      });
      mockRefreshPost.mockResolvedValueOnce({});

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('testuser');
      });

      expect(mockRefreshPost).toHaveBeenCalledWith('/auth/refresh');
      expect(mockRefreshGet).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleAuthSuccess', () => {
    it('user를 설정하되 localStorage에는 저장하지 않아야 한다', async () => {
      const user = userEvent.setup();
      mockRefreshGet.mockRejectedValueOnce(createAxiosError(401));
      mockRefreshPost.mockRejectedValueOnce(createAxiosError(401));

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
      });

      await user.click(screen.getByRole('button', { name: 'handleAuthSuccess' }));

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('testuser');
      });

      expect(screen.getByTestId('token')).toHaveTextContent('null');
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('서버에 로그아웃 요청 후 user를 초기화하고 legacy auth storage를 제거해야 한다', async () => {
      const user = userEvent.setup();
      mockRefreshGet.mockResolvedValueOnce({ data: mockUser });

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('testuser');
      });

      localStorageMock.setItem('access_token', 'legacy-token');
      localStorageMock.setItem('refresh_token', 'legacy-refresh-token');
      localStorageMock.setItem('user', JSON.stringify(mockUser));
      mockRefreshPost.mockClear();
      mockRefreshPost.mockResolvedValueOnce({});

      await user.click(screen.getByRole('button', { name: 'logout' }));

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('null');
      });

      expect(screen.getByTestId('token')).toHaveTextContent('null');
      expect(mockRefreshPost).toHaveBeenCalledWith('/auth/logout');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('access_token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('refresh_token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('user');
    });

    it('서버 로그아웃 실패해도 클라이언트 로그아웃이 진행되어야 한다', async () => {
      const user = userEvent.setup();
      mockRefreshGet.mockResolvedValueOnce({ data: mockUser });

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('testuser');
      });

      mockRefreshPost.mockClear();
      mockRefreshPost.mockRejectedValueOnce(new Error('Network error'));

      await user.click(screen.getByRole('button', { name: 'logout' }));

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('null');
      });

      expect(screen.getByTestId('token')).toHaveTextContent('null');
    });
  });

  describe('authModal', () => {
    it('모달을 열고 닫아야 한다', async () => {
      const user = userEvent.setup();
      mockRefreshGet.mockRejectedValueOnce(createAxiosError(401));
      mockRefreshPost.mockRejectedValueOnce(createAxiosError(401));

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );

      expect(screen.getByTestId('modalOpen')).toHaveTextContent('false');

      await user.click(screen.getByText('openModal'));
      expect(screen.getByTestId('modalOpen')).toHaveTextContent('true');

      await user.click(screen.getByText('closeModal'));
      expect(screen.getByTestId('modalOpen')).toHaveTextContent('false');
    });
  });

  describe('auth:required 이벤트', () => {
    it('auth:required 이벤트 발생 시 로그인 모달을 열고 사용자를 초기화해야 한다', async () => {
      localStorageMock.setItem('access_token', 'legacy-token');
      localStorageMock.setItem('refresh_token', 'legacy-refresh-token');
      localStorageMock.setItem('user', JSON.stringify(mockUser));
      mockRefreshGet.mockResolvedValueOnce({ data: mockUser });

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('testuser');
      });

      act(() => {
        window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
      });

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('null');
      });

      expect(screen.getByTestId('token')).toHaveTextContent('null');
      expect(screen.getByTestId('modalOpen')).toHaveTextContent('true');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('refresh_token');
    });

    it('이벤트 리스닝에 AUTH_REQUIRED_EVENT 상수를 사용해야 한다', () => {
      expect(AUTH_REQUIRED_EVENT).toBe('auth:required');

      const addSpy = vi.spyOn(window, 'addEventListener');
      mockRefreshGet.mockReturnValue(new Promise(() => {}));

      function hookWrapper({ children }: { children: ReactNode }) {
        return <AuthProvider>{children}</AuthProvider>;
      }

      renderHook(() => useAuth(), { wrapper: hookWrapper });

      const authRequiredCalls = addSpy.mock.calls.filter(([event]) => event === AUTH_REQUIRED_EVENT);
      expect(authRequiredCalls.length).toBeGreaterThan(0);

      addSpy.mockRestore();
    });
  });
});
