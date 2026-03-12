import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
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
    it('should throw error when used outside AuthProvider', () => {
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

  describe('AuthProvider initial state', () => {
    it('should have user null and isLoading false after mount', async () => {
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

    it('should restore user and token from localStorage', async () => {
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

    it('should handle corrupted user JSON in localStorage', async () => {
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
    it('should call API, set user/token, and save to localStorage', async () => {
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
    it('should call API, set user/token, and save to localStorage', async () => {
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
    it('should clear user/token and remove from localStorage', async () => {
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
    it('should open modal with login mode by default', async () => {
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

    it('should open modal with signup mode', async () => {
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

    it('should close modal and preserve mode', async () => {
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

  describe('auth:required event', () => {
    it('should open login modal and clear user on auth:required event', async () => {
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
  });
});
